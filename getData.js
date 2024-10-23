const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require("../../my-fruits-basket-firebase-adminsdk-2art4-672f8d9669.json");

const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://my-fruit-basket.firebaseio.com'
  });

const postsRef = app.firestore().collection('posts');
postsRef.get().then((querySnapshot) => {
  const array = [];
  querySnapshot.forEach((doc) => {
    //console.log(doc.data().title);
    const id = doc.id;
    const postData = doc.data();
    const { title, type, imageIds, movie, albums, women, artists, tags, comment, have, love, cover, use, discarded, createdAt, updatedAt } = postData;
    const post = {
      id,
      title,
      type,
      imageIds,
      movie,
      albums,
      women,
      artists,
      tags,
      comment,
      have,
      love,
      cover,
      use,
      discarded,
      createdAt: createdAt.toDate(),
      updatedAt: updatedAt.toDate()
    };
    array.push(post);
  });
  const jsonData = JSON.stringify(array, null, 2);
  fs.writeFile('../../posts.json', jsonData, (err) => {
    if (err) {
      console.err(err);
      return;
    }
  });
});

const womenRef = app.firestore().collection('women');
womenRef.get().then((querySnapshot) => {
  const array = [];
  querySnapshot.forEach((doc) => {
    //console.log(doc.data().name);
    const id = doc.id;
    const postData = doc.data();
    const { name, yomi } = postData;
    const post = {
      id,
      name,
      yomi
    };
    array.push(post);
  });
  const jsonData = JSON.stringify(array, null, 2);
  fs.writeFile('../../women.json', jsonData, (err) => {
    if (err) {
      console.err(err);
      return;
    }
  });
});

const artistsRef = app.firestore().collection('artists');
artistsRef.get().then((querySnapshot) => {
  const array = [];
  querySnapshot.forEach((doc) => {
    //console.log(doc.data().name);
    const id = doc.id;
    const postData = doc.data();
    const { name, yomi } = postData;
    const post = {
      id,
      name,
      yomi
    };
    array.push(post);
  });
  const jsonData = JSON.stringify(array, null, 2);
  fs.writeFile('../../artists.json', jsonData, (err) => {
    if (err) {
      console.err(err);
      return;
    }
  });
});

const tagsRef = app.firestore().collection('tags');
tagsRef.get().then((querySnapshot) => {
  const array = [];
  querySnapshot.forEach((doc) => {
    //console.log(doc.data().name);
    const id = doc.id;
    const postData = doc.data();
    const { name, yomi } = postData;
    const post = {
      id,
      name,
      yomi
    };
    array.push(post);
  });
  const jsonData = JSON.stringify(array, null, 2);
  fs.writeFile('../../tags.json', jsonData, (err) => {
    if (err) {
      console.err(err);
      return;
    }
  });
});

const albumsRef = app.firestore().collection('albums');
albumsRef.get().then((querySnapshot) => {
  const array = [];
  querySnapshot.forEach((doc) => {
    //console.log(doc.data().name);
    const id = doc.id;
    const postData = doc.data();
    const { name, yomi } = postData;
    const post = {
      id,
      name,
      yomi
    };
    array.push(post);
  });
  const jsonData = JSON.stringify(array, null, 2);
  fs.writeFile('../../albums.json', jsonData, (err) => {
    if (err) {
      console.err(err);
      return;
    }
  });
});
