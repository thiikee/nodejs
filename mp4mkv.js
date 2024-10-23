const sqlite3 = require('sqlite3');
const fs = require('fs');
const db = new sqlite3.Database('../thiikee.github.io/my-fruits-basket/db.sqlite');

const postsJson = JSON.parse(fs.readFileSync('../../posts.json', 'utf8'));
for (const key in postsJson) {
  if (postsJson[key].type == 'movie') {
    console.log(postsJson[key].movie.replace('Genre', 'genre'));
  }
}
