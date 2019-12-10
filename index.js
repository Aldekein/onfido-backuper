'use strict';

const Onfido = require('onfido');
var fs = require('fs');

// configurable variables
// rate limit to 4 requests/sec max, based on https://documentation.onfido.com/#rate-limits
const throttle = require('promise-ratelimit')(200);
const recordsPerPage = 100;
const applicantsDataPath = 'data/applicants.json';
const processedDataPath = 'data/processed.json';

// no need to configure below, initialization
const secret = fs.readFileSync('config/onfido_token.txt', 'utf8');
const defaultClient = Onfido.ApiClient.instance;
const tokenAuth = defaultClient.authentications['Token'];
tokenAuth.apiKey = 'token='+secret;
tokenAuth.apiKeyPrefix = 'Token';
const api = new Onfido.DefaultApi();
var markedAsProcessed = [];

(async () => {
  // get all applicants you’ve created
  var allApplicants;
  if (!fs.existsSync('data')) fs.mkdirSync('data');
  if (fs.existsSync(processedDataPath)) {
    markedAsProcessed = JSON.parse(fs.readFileSync(processedDataPath, 'utf8'));
  }
  if (fs.existsSync(applicantsDataPath)) {
    allApplicants = JSON.parse(fs.readFileSync(applicantsDataPath, 'utf8'));
  }
  else {
    allApplicants = await listAllApplicants();
    fs.writeFileSync(applicantsDataPath, JSON.stringify(allApplicants, null, 2));
    console.log('Updated applicants data saved to ' + applicantsDataPath);
  }
  console.log(`${allApplicants.length} total applicants to be processed.`);

  // get all documents for every applicant and save them to disk
  allApplicants.forEach(entry => saveApplicantDocuments(entry.id));
})();


async function listAllApplicants() {
  try {
    let currentPage=0;
    var allApplicants = [];

    console.log(`Downloading applicants data, ${recordsPerPage} records per page:`);

    while (currentPage == 0 || applicants.length == recordsPerPage) {
      currentPage++;
      
      await throttle();
      console.log(`Getting page ${currentPage}`);
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
  if (!markedAsProcessed.includes(applicantId)) {
    try {
      await throttle();
      console.log(`Requesting documents for applicant ${applicantId}...`);
      const { documents } = await api.listDocuments(applicantId);
      
      const path = 'data/'+applicantId;
      if (!fs.existsSync(path)) fs.mkdirSync(path);
      documents.forEach(document => saveApplicantDocument(applicantId, document));
    } catch(e) {
      console.log('ERROR CAUGHT:');
      console.log(e);
    }
  }
}

async function saveApplicantDocument(applicantId, document) {
  try {
    const documentId = document.id, 
          docType = document.type, 
          fileType = document.file_type, 
          fileSize = document.file_size,
          path = `data/${applicantId}/${docType}-${documentId}.${fileType}`;

    // this allows to download files only once and save a lot of traffic and requests
    if (!fs.existsSync(path) || fs.statSync(path)['size'] != fileSize) {
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
    else {
      markedAsProcessed.push(applicantId);
      // that sucks, neet to do once:
      fs.writeFileSync(processedDataPath, JSON.stringify(markedAsProcessed, null, 2));
    }
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}