# onfido-backuper
This tool will create a backup of most important user data in your Onfido account

# Usage
* Create `config/onfido_token.txt` file and past your API token there
* User `create_db_tables.sql` to create required tables in MySQL database
* Run `node index.js init`, `node index.js cache`, `node index.js download` to make the backup
* Applicants' KYC data and documents from your account will be downloaded to a `data` directory
* Make sure you strongly encrypt this data before storage, since there's lots of PII!

# Not planned, but possible improvements
* Support other Onfido data that may exist in account (videos, live photos etc)
* Make it more suitable for automated backups (pass secrets via ENV, improve logging)