# onfido-backuper
This tool will create a backup of all data in your Onfido account

# Usage
* Create `config/onfido_token.txt` file and past your API token there
* Run `node index.js` to make the backup
* Applicants' KYC data and documents from your account will be downloaded to a `data` directory
* Make sure you strongly encrypt this data before storage, since there's lots of PII!

# Not planned, but poossible improvements
* Support other Onfido data that may exist in account (checks, videos, live photos etc)
* Make it more suitable for automated update (pass secrets via ENV, improve logging)