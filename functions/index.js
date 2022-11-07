'use strict';


const functions = require('firebase-functions');
const path = require('path');
const os = require('os');
const fs = require('fs');


// as per the firebase documentation.
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./serviceaccountdetails.json');
const admin = require('firebase-admin');


// initialize the app using admin, service account, database url.
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://zupaloop-sandbox2022-default-rtdb.firebaseio.com"
});


// initialize the firestore databse service in the code by creating the object.
const firestoreDB = admin.firestore();


// initialization of the second bucket. This step is required otherwise bucket will be set to default bucket.
const bucket = getStorage().bucket('zupaloop-sandbox2022.appspot.com');


const algoliasearch = require("algoliasearch");

// This is your unique application identifier. It's used to identify you when using Algolia's API.
const APPLICATION_ID = "03FEFCHVWW";

// This is the ADMIN API key. This secret key is used to create, update and DELETE your indices.
const ADMIN_API_KEY = "0472cce5fd0f92cd6723dfbca2da7a33";

// initialize the client.
const client = algoliasearch(APPLICATION_ID, ADMIN_API_KEY);

// initialize the index with the same name as of the collection in firestore.
const index = client.initIndex('zupaloop');


// Imports the Google Cloud Video Intelligence library.
const videoIntelligence = require('@google-cloud/video-intelligence');


// Creates a client. Video intelligence service client is created.
// provide the service account details otherwise we can't access the video intelligence service.
const videoclient = new videoIntelligence.VideoIntelligenceServiceClient({keyFilename:'serviceaccountdetails.json'});


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


// this function takes any json object and does the filter and returns "an array of dictionaries/objects".
function objectAnnotations(jsonBlob) {
        var objectAnnotate = null;

        // "annotation_results" is the key of the entire object. The value is an "array with big dictionary".
        console.log("jason blob annotation results", jsonBlob.annotation_results.length);
        jsonBlob.annotation_results
                .filter((annotation) => {
                // Ignore all the objects/dictionaries without "object annotations". We get an array of objects/dictionaries which contains the key "object_annotations".
                objectAnnotate = annotation.object_annotations;
                });

                var filteredObjectsList = [];

                // for each object/dictionary in "objectAnnotate", just select the required attributes and make an individual object and push to the new array.
                objectAnnotate.forEach(object => {

                        // select only those objects whose confidence value is more than 80%.
                        if (object.confidence > 0.50) {

                                // to get the duration and to round off the duration value.
                                var startTime = (object.segment.start_time_offset.seconds || 0) + ((object.segment.start_time_offset.nanos / 1e9) || 0);
                                var startTimeRoundOff = startTime.toFixed(2);
                                console.log("start time", startTimeRoundOff);

                                var endTime = (object.segment.end_time_offset.seconds || 0) + ((object.segment.end_time_offset.nanos / 1e9) || 0);
                                var endTimeRoundOff = endTime.toFixed(2);
                                console.log("end time", endTimeRoundOff);

                                var duration = endTimeRoundOff - startTimeRoundOff;
                                var durationRoundOff = Math.round((duration + Number.EPSILON) * 100) / 100;
                                console.log("rounded", durationRoundOff);


                                // check for the duration and select only those objects which have duration greater than 0.5 seconds.
                                if (duration > 0.5) {
                                        // selected attributes of each object.
                                        var individualObject = {};
                                        individualObject.description = object.entity.description;
                                        individualObject.startTime = startTimeRoundOff;
                                        individualObject.endTime = endTimeRoundOff;
                                        individualObject.duration = durationRoundOff;

                                        filteredObjectsList.push(individualObject);

                                };
                        };

                });

        return filteredObjectsList;
};


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


function startTimeProvider(listOfObjects) {

        var firstObject = listOfObjects[0];

        var start_time = (firstObject.start_time.seconds || 0) + ((firstObject.start_time.nanos / 1e9) || 0);
        var startTimeRoundOff = start_time.toFixed(2);
        return startTimeRoundOff
};


function endTimeProvider(listOfObjects) {

        var lastObject = listOfObjects[listOfObjects.length - 1];

        var end_time = (lastObject.end_time.seconds || 0) + ((lastObject.end_time.nanos / 1e9) || 0);
        var endTimeRoundOff = end_time.toFixed(2);
        return endTimeRoundOff
};


// this function takes any json object and does the filter and returns "an array of dictionaries/objects".
function transcribeVideoIntelligence(jsonBlob) {
        var transcribeVideo = null;

        // "annotation_results" is the key of the entire object. The value is an "array with big dictionary".
        console.log("length of \"annotation_results\" list is", jsonBlob.annotation_results.length);
        jsonBlob.annotation_results
                .filter((annotation) => {
                // Ignore all the objects/dictionaries without "speech transcriptions". We get an array of objects/dictionaries which contains the key "speech transcriptions".
                transcribeVideo = annotation.speech_transcriptions;
                });

                var filteredObjectsList = [];

                // for each object/dictionary in "objectAnnotate", just select the required attributes and make an individual object and push to the new array.
                transcribeVideo.forEach(object => {

                                // { alternatives: [ {} ], language_code: 'en-us' }
                                // object.alternatives will always contain one dictionary in the array. It can be an empty dictionary or a dictionary with content.
                                
                                // select only those objects whose "object.alternatives[0] is not an empty dictionary" and confidence is more than 80%.
                                // "object.alternatives[0]" should not be an empty dictionary, it should contain any keyword like "transcript".
                                if (object.alternatives[0].transcript){
                                        if (object.alternatives[0].confidence > 0.80) {
                                                
                                                // console.log(object.alternatives[0]);

                                                // extract and keep all the required values.
                                                const startTime = startTimeProvider(object.alternatives[0].words);
                                                const endTime = endTimeProvider(object.alternatives[0].words);

                                                const numb = endTime - startTime;
                                                var rounded = Math.round((numb + Number.EPSILON) * 100) / 100;
                                                var duration = rounded;
                                                

                                                // select only the required attributes from an object.
                                                var individualObject = {};
                                                individualObject.description = object.alternatives[0].transcript;
                                                individualObject.startTime = startTime;
                                                individualObject.endTime = endTime;
                                                individualObject.duration = duration;

                                                filteredObjectsList.push(individualObject);
                                        };
                                
                                };
                });
                
        return filteredObjectsList;
};


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


// this is the trigger function for the default bucket.
exports.firebaseStorageOnWrite = functions.storage.object().onFinalize(async (object) => {

        // File path in the bucket.
        const filePath = object.name;
        console.log("filePath is", filePath);
        // videos/d8YKI8RDbPaJAEPlYWqU4Lu4Mdy2/video_50EAF025-1B5A-49E8-B7B3-768AE35492ED.mp4


        // since there are 2 folders, we should specify the folder which starts with the name "videos".
        // the below code lines are not applicable to "videoThumbnails" folder.
        if (filePath.startsWith("videos/")) {
                // find the userID from the file path.
                var filePathArray = filePath.split("/");
                var videos = filePathArray[0];
                var userID = filePathArray[1];

                const fileName = path.basename(filePath);
                // video_50EAF025-1B5A-49E8-B7B3-768AE35492ED.mp4

                var fileNameArray = fileName.split("_");
                var suffix = fileNameArray[0];
                var basename = fileNameArray[1];
                // 50EAF025-1B5A-49E8-B7B3-768AE35492ED.mp4

                var basenameArray = basename.split(".");
                var videoID = basenameArray[0];
                var fileExtension = basenameArray[1];

                // name of the default Firebase storage bucket.
                const fileBucket = object.bucket;
                console.log("name of the default bucket is", fileBucket);


                // The GCS uri of the video to analyze. Cloud Storage URI comprises your bucket name and your object (filename).
                var gcsUri = `gs://${fileBucket}/${filePath}`;
                console.log("input uri is", gcsUri);

                var outputUri = gcsUri.replace(".mp4", ".json");
                console.log("output uri is", outputUri);


                // write a query to get the details of "video document" from the database if it exists.
                var videoName = null;

                await firestoreDB.doc(`/videos/${videoID}`)
                        .get()
                        .then(doc => {
                                if (!doc.exists) {
                                        console.log("doc not found");
                                }

                                var videoDetailsFromDB = doc.data();
                                videoName = videoDetailsFromDB.name;
                                console.log("video name", videoName);
                        })
                        .catch(err => {
                                console.log("Failed to get videos", err);
                        });


        // -----------------------------------------------------------------------------------------------------------------------


                // if the content type is video, then process the video file.
                if ((fileExtension == "mp4") && (suffix == "video")) {
                        if ((userID == "RingrK9ak2P3fplRNmhi4HyIV513") || (userID == "Vx6ATW1LZlVXDbdGAOKFLkHan012") || (userID == "d8YKI8RDbPaJAEPlYWqU4Lu4Mdy2") || (userID == "Wa5qbaXhe6Ww0CjzZRi8Tz9NNdg1")) {

                                console.log("a video is uploaded");

                                const request = {
                                        // as per the definition of "annotateVideo" function, we should only provide the "GCS uri" of the video to analyze.
                                        inputUri: gcsUri,

                                        // as per the definition of "annotateVideo" function, we should only provide the "GCS path" for the output file.
                                        outputUri: outputUri,
                                        features: ['OBJECT_TRACKING']
                                };

                                console.log("Starting the annotation process");
                                const [operation] = await videoclient.annotateVideo(request);
                                console.log("Processing done");

                        }
                        
                }


                if ((fileExtension == "json") && (suffix == "video")) {

                        // "os.tmpdir()" method of the os module is used to get path of default directory for temporary files of the operating system.
                        const tempFilePath = path.join(os.tmpdir(), fileName);
                        console.log(tempFilePath);

                        // download the file using the "filePath" and store in a temporary directory during the execution of the function.
                        await bucket.file(filePath).download({destination: tempFilePath});
                        functions.logger.log('file downloaded locally to', tempFilePath);


                        // read the downloaded json file using 'fs' module and convert it to a json object.
                        // These are the objects present in the video frame. (i.e. snow, baby laughing, bridal shower).
                        fs.readFile(tempFilePath, {encoding: 'utf-8'}, async function(err,data){
                                if (!err) {
                                        // convert the string to "json blob" object.
                                        var blob = JSON.parse(data);
                                        const videoData = objectAnnotations(blob);
                                        console.log("processed record count", videoData.length);
                                        console.log("json processing done");

                                        // Add the userID and videoID for each document and then save the documents to the algolia dataset.
                                        if (videoData.length) {
                                                videoData.forEach((document) => {
                                                        document.type = "video";  // Hard coded value.
                                                        document.name = videoName;
                                                        document.videoID = videoID;
                                                        document.userID = userID;
                                                })
                                        };

                                        // save the filtered rows to algolia dataset.
                                        await index.saveObjects(videoData, { autoGenerateObjectIDIfNotExist: true })
                                        .then(() => {
                                        console.log("upload successful");
                                        })
                                        .catch(console.error);
                                }
                                else {
                                        console.log(err);
                                }
                        });
                        
                }


        // -----------------------------------------------------------------------------------------------------------------------


                // if the content is audio, then execute the following.
                if ((fileExtension == "mp4") && ((suffix == "audio") || (suffix == "systemAudio"))) {
                        if ((userID == "RingrK9ak2P3fplRNmhi4HyIV513") || (userID == "Vx6ATW1LZlVXDbdGAOKFLkHan012") || (userID == "d8YKI8RDbPaJAEPlYWqU4Lu4Mdy2")|| (userID == "Wa5qbaXhe6Ww0CjzZRi8Tz9NNdg1")) {

                                console.log("an audio file is uploaded");

                                const videoContext = {
                                        speechTranscriptionConfig: {
                                        languageCode: 'en-US',
                                        enableAutomaticPunctuation: true,
                                        },
                                };

                                const request = {
                                        inputUri: gcsUri,
                                        outputUri: outputUri,
                                        features: ['SPEECH_TRANSCRIPTION'],
                                        videoContext: videoContext,
                                };

                                console.log("Starting the annotation process");
                                const [operation] = await videoclient.annotateVideo(request);
                                console.log("Processing done");

                        }
                        
                }


                if ((fileExtension == "json") && ((suffix == "audio") || (suffix == "systemAudio"))) {

                // "os.tmpdir()" method of the os module is used to get path of default directory for temporary files of the operating system.
                const tempFilePath = path.join(os.tmpdir(), fileName);
                console.log(tempFilePath);

                // download the file using the "filePath" and store in a temporary directory during the execution of the function.
                await bucket.file(filePath).download({destination: tempFilePath});
                functions.logger.log('file downloaded locally to', tempFilePath);


                // read the downloaded json file using 'fs' module and convert it to a json object.
                // These are the objects present in the video frame. (i.e. snow, baby laughing, bridal shower).
                fs.readFile(tempFilePath, {encoding: 'utf-8'}, async function(err,data){
                        if (!err) {
                                // convert the string to json object.
                                var blob = JSON.parse(data);
                                const audioData = transcribeVideoIntelligence(blob);
                                console.log("processed record count of audio data", audioData.length);
                                console.log("json processing done");

                                // Add the userID and videoID for each document and then save the documents to the algolia dataset.
                                if (audioData.length) {
                                        audioData.forEach((document) => {
                                                document.type = "audio";  // Hard coded value.
                                                document.name = videoName;
                                                document.videoID = videoID;
                                                document.userID = userID;
                                        })
                                };

                                // save the filtered rows to algolia dataset.
                                await index.saveObjects(audioData, { autoGenerateObjectIDIfNotExist: true })
                                .then(() => {
                                console.log("upload successful");
                                })
                                .catch(console.error);
                        }
                        else {
                                console.log(err);
                        }
                })};
        }
});