const sqlite3 = require('sqlite3');
const admin = require('firebase-admin');
const db = new sqlite3.Database('../thiikee.github.io/my-fruits-basket/db.sqlite');
const serviceAccount = require("../../my-fruits-basket-firebase-adminsdk-2art4-672f8d9669.json");
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://my-fruit-basket.firebaseio.com'
});

db.all('select id from posts inner join binding on posts.id = binding.postId where binding.albumName = "Video Collection";', (err, rows) => {
  rows.forEach((row) => {
    console.log(row.id);
    const postRef = app.firestore().collection('posts').doc(row.id);
    const res = postRef.update({albums: []});
  });
});
