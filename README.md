How to deploy functions to firebase??



For the 1st time app deployment:-

If you want to deploy the application for the first time, then follow the steps.


1) npm install -g firebase-tools
- will install firebase cli.

2) firebase login
- to login from firebase cli.

3) firebase init
- firebase init   command will create "firebase.json" file.
- select "functions" in the options.
- the program asks to chose the correct project name.

4) make sure to keep the "index.js" project file inside the "functions" folder.
- remove the "app.listen" function in the "index.js" file. It will be automatically done by firebase.
- add the command "exports.app = functions.https.onRequest(app);" in the index.js file.

5) firebase deploy
- to deploy. Here we get the hosted url.


------------------------------------------------------------------------------------------------------------------------

2nd time deployment:-

If you have already deployed the application and want to deploy again after making some changes, then follow the steps.


1) firebase login
- to login from firebase cli.

2) firebase projects:list
- to get the list of projects.

3) firebase use PROJECTNAME
- select the project from the list.

4) firebase init
- select "functions" in the options.
- the program asks to chose the correct project name.

5) firebase deploy
- to deploy. Here we get the hosted url.