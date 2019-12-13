'use strict';

const Onfido = require('onfido');
var fs = require('fs');

// configurable variables
// rate limit to 4 requests/sec max, based on https://documentation.onfido.com/#rate-limits
const throttle = require('promise-ratelimit')(200);
const recordsPerPage = 100;
const applicantsDataPath = 'data/applicants.json';

// init mysql to be used in script for cache, see create_db_table.sql for model
var mysql = require('mysql');
var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'onfido'
});
connection.connect();

// no need to configure below, initialization
const secret = fs.readFileSync('config/onfido_token.txt', 'utf8');
const defaultClient = Onfido.ApiClient.instance;
const tokenAuth = defaultClient.authentications['Token'];
tokenAuth.apiKey = 'token='+secret;
tokenAuth.apiKeyPrefix = 'Token';
const api = new Onfido.DefaultApi();

(async () => {
  if (process.argv[2] == 'init') {
      // get all applicants you’ve created
      if (!fs.existsSync('data')) fs.mkdirSync('data');
      var allApplicants = await listAllApplicants();
      fs.writeFileSync(applicantsDataPath, JSON.stringify(allApplicants, null, 2));
      console.log('Updated applicants data saved to ' + applicantsDataPath);
      connection.end();
  }
  else if (process.argv[2] == 'cache') {
      if (!fs.existsSync('data') || !fs.existsSync(applicantsDataPath)) {
        console.log('Please run: node index.js init');
      }

      // get all applicants you’ve created
      var allApplicants = JSON.parse(fs.readFileSync(applicantsDataPath, 'utf8'));
      console.log(`${allApplicants.length} total applicants to be processed.`);

      await allApplicants.forEach(entry => cacheApplicantData(entry));
      await allApplicants.forEach(entry => cacheApplicantChecks(entry.id));

      // get all documents for every applicant and save them to disk
      await allApplicants.forEach(entry => cacheApplicantDocuments(entry.id));
      
      // connection.end();
  }
  else if (process.argv[2] == 'download') {
    var query = connection.query('SELECT * FROM files WHERE status=0', [], async function (error, results, fields) {
      if (error) throw error;
      await results.forEach(document => saveApplicantDocument(document));
      // connection.end();
    });
  }
  else {
    console.log('Call me like: node index.js init or node index.js download')
  }
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

async function cacheApplicantData(applicant) {
  try {
    const recordData = {
      applicantId: applicant.id,
      data: JSON.stringify(applicant)
    };
    connection.query('INSERT INTO applicants SET ? ON DUPLICATE KEY UPDATE applicantId=applicantId', recordData, function (error, results, fields) {
      if (error) throw error;
    });
  } catch(e) {
    console.log('DB ERROR CAUGHT:');
    console.log(e);
  }
}

async function cacheApplicantDocuments(applicantId) {
  try {
    await throttle();
    console.log(`Requesting documents for applicant ${applicantId}...`);
    const { documents } = await api.listDocuments(applicantId);

    connection.query('UPDATE applicants SET documentCount=? WHERE applicantId=?', [documents.length, applicantId], function (error, results, fields) {
      console.log(`Expecting to download ${documents.length} documents for applicant ${applicantId}.`);	
    });
    
    const path = 'data/'+applicantId;
    if (!fs.existsSync(path)) fs.mkdirSync(path);
    documents.forEach(document => cacheApplicantDocument(applicantId, document));
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}

async function cacheApplicantChecks(applicantId) {
  try {
    await throttle();
    console.log(`Requesting checks for applicant ${applicantId}...`);

    var checks = await api.apiClient.callApi(
      '/applicants/{applicant_id}/checks', 'GET',
      {'applicant_id': applicantId}, {expand: 'reports'}, {}, {}, {}, null,
      ['Token'], [], ['application/json'], Onfido.ChecksList
    );

    connection.query('INSERT INTO checks SET ? ON DUPLICATE KEY UPDATE applicantId=applicantId', [{applicantId: applicantId, data: checks.response.res.text}], function (error, results, fields) {
      if (error) throw error;
    });
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}

async function cacheApplicantDocument(applicantId, document) {
  try {
    const path = `data/${applicantId}/${document.type}-${document.id}.${document.file_type}`;
    const processed = (fs.existsSync(path)) ? 1 : 0; // cannot check && fs.statSync(path)['size'] == document.file_size, Onfido returns fake size!
    const recordData = {
      applicantId: applicantId, 
      documentId: document.id, 
      docType: document.type,
      fileType: document.file_type,
      fileSize: document.file_size,
      status: processed
    };

    connection.query('INSERT INTO files SET ? ON DUPLICATE KEY UPDATE status=?', [recordData, processed], function (error, results, fields) {
      if (error) throw error;
    });
  } catch(e) {
    console.log('DB ERROR CAUGHT:');
    console.log(e);
  }
}

async function saveApplicantDocument(document) {
  try {
    const applicantId = document.applicantId,
          documentId = document.documentId, 
          docType = document.docType, 
          fileType = document.fileType, 
          fileSize = document.fileSize,
          docStatus = document.status,
          path = `data/${applicantId}/${docType}-${documentId}.${fileType}`;

    const dirPath = 'data/'+applicantId;
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);

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
    if (docStatus == 0) {
      var query = connection.query('UPDATE files SET status=1 WHERE applicantId=? and documentId=?', [ applicantId, documentId ], function (error, results, fields) {
        if (error) {
          console.log(query.sql);
          throw error;
        }
      });
    }
  } catch(e) {
    console.log('ERROR CAUGHT:');
    console.log(e);
  }
}