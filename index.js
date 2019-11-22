'use strict';

const Onfido = require('onfido');
var fs = require('fs');
// rate limit to 4 requests/sec max, based on https://documentation.onfido.com/#rate-limits
const throttle = require('promise-ratelimit')(200);
const secret = fs.readFileSync('config/onfido_token.txt', 'utf8');
const recordsPerPage = 100;

const defaultClient = Onfido.ApiClient.instance;
const tokenAuth = defaultClient.authentications['Token'];
tokenAuth.apiKey = 'token='+secret;
tokenAuth.apiKeyPrefix = 'Token';
if (!fs.existsSync('data')) fs.mkdirSync('data');
const api = new Onfido.DefaultApi();

(async () => {
  // get all applicants you’ve created
  var allApplicants = await listAllApplicants();
  console.log(`${allApplicants.length} total applicants received`);

  fs.writeFileSync('data/applicants.json', JSON.stringify(allApplicants, null, 2));
  console.log('Applicants data saved to data/applicants.json');

  // get all documents for every applicant and save them to disk
  allApplicants.forEach(entry => saveApplicantDocuments(entry.id));
})();


async function listAllApplicants() {
  try {
    let currentPage=0;
    var allApplicants = [];

    console.log(`Downloading applicants data, ${recordsPerPage} records per page:`);

    while (currentPage == 0 || (applicants.length == recordsPerPage)) {
      currentPage++;
      console.log(`Getting page ${currentPage}`);
      
      await throttle();
      var { applicants } = await api.listApplicants({per_page: recordsPerPage, page: currentPage});
      applicants.forEach(entry => allApplicants.push(entry));
    }

    return allApplicants;
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}

async function saveApplicantDocuments(applicantId) {
  try {
    console.log(`Requesting documents for applicant ${applicantId}...`);
    
    await throttle();
    const { documents } = await api.listDocuments(applicantId);
    
    const path = 'data/'+applicantId;
    if (!fs.existsSync(path)) fs.mkdirSync(path);
    documents.forEach(document => saveApplicantDocument(applicantId, document.id, document.type, document.file_type));
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}

async function saveApplicantDocument(applicantId, documentId, docType, fileType) {
  try {
    const path = `data/${applicantId}/${docType}-${documentId}.${fileType}`;
    // this allows to download files only once and save a lot of traffic and requests
    if (!fs.existsSync(path)) {
      await throttle();
      const document = await api.apiClient.callApi(
        `/applicants/${applicantId}/documents/${documentId}/download`, 'GET',
        { 'applicant_id': applicantId, 'document_id': documentId }, 
        {}, {}, {}, {}, null, ['Token'], [], ['*/*', 'application/json'], 'Blob'
      );
      // The previous code is required, since such documented API usage fails:
      // const document = await api.downloadDocument(applicantId, documentId);
      // See https://github.com/onfido/api-javascript-client/issues/2 for details

      fs.writeFileSync(path, document.data);
      console.log(`Saved document ${docType} ${documentId} for applicant ${applicantId}`);
    }
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}