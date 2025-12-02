const sqlite3 = require('sqlite3');
const fs = require('fs');
const db = new sqlite3.Database('../thiikee.github.io/my-fruits-basket/db.sqlite');

db.serialize(() => {
  db.run('delete from cast');
  db.run('delete from work');
  db.run('delete from tagging');
  db.run('delete from binding');
  db.run('delete from posts');
  db.run('delete from women');
  db.run('delete from artists');
  db.run('delete from tags');
  db.run('delete from albums');
  db.run('delete from images');
  db.run('delete from movies');
  //db.run('delete from sqlite_sequence where name = "posts"');

  const postsJson = JSON.parse(fs.readFileSync('../../posts.json', 'utf8'));
  for (const key in postsJson) {
    //console.log(postsJson[key].title);
    db.run('insert into posts(id, title, type, have, love, cover, use, comment, discarded, createdAt, updatedAt, m3u8) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', postsJson[key].id, postsJson[key].title, postsJson[key].type, postsJson[key].have, postsJson[key].love, postsJson[key].cover, postsJson[key].use, postsJson[key].comment, postsJson[key].discarded, postsJson[key].createdAt, postsJson[key].updatedAt, postsJson[key].m3u8);
  }

  const womenJson = JSON.parse(fs.readFileSync('../../women.json', 'utf8'));
  for (const key in womenJson) {
    //console.log(womenJson[key].name);
    db.run('insert into women(name, yomi) values (?, ?)', womenJson[key].name, womenJson[key].yomi, err => {
      if (err) {
        console.error(womenJson[key].name);
        console.error(err.message);
      }
    });
  }

  const artistsJson = JSON.parse(fs.readFileSync('../../artists.json', 'utf8'));
  for (const key in artistsJson) {
    //console.log(artistsJson[key].name);
    db.run('insert into artists(name, yomi) values (?, ?)', artistsJson[key].name, artistsJson[key].yomi);
  }

  const tagsJson = JSON.parse(fs.readFileSync('../../tags.json', 'utf8'));
  for (const key in tagsJson) {
    //console.log(tagsJson[key].name);
    db.run('insert into tags(name, yomi) values (?, ?)', tagsJson[key].name, tagsJson[key].yomi, err => {
      if (err) {
        console.error(tagsJson[key].name);
        console.error(err.message);
      }
    });
  }

  const albumsJson = JSON.parse(fs.readFileSync('../../albums.json', 'utf8'));
  for (const key in albumsJson) {
    //console.log(albumsJson[key].name);
    db.run('insert into albums(name, yomi) values (?, "")', albumsJson[key].name);
  }

  for (const key in postsJson) {
    if (postsJson[key].women.length != 0) {
      for (const wkey in postsJson[key].women) {
        //console.log(postsJson[key].id);
        db.run('insert into cast(postId, womanName) select posts.id, ? from posts where id = ?', postsJson[key].women[wkey], postsJson[key].id);
      }
    }
  }

  for (const key in postsJson) {
    if (postsJson[key].artists.length != 0) {
      for (const wkey in postsJson[key].artists) {
        //console.log(postsJson[key].id);
        db.run('insert into work(postId, artistName) select posts.id, ? from posts where id = ?', postsJson[key].artists[wkey], postsJson[key].id);
      }
    }
  }

  for (const key in postsJson) {
    if (postsJson[key].tags.length != 0) {
      for (const wkey in postsJson[key].tags) {
        //console.log(postsJson[key].id);
        db.run('insert into tagging(postId, tagName) select posts.id, ? from posts where id = ?', postsJson[key].tags[wkey], postsJson[key].id);
      }
    }
  }

  for (const key in postsJson) {
    if (postsJson[key].albums.length != 0) {
      for (const wkey in postsJson[key].albums) {
        //console.log(postsJson[key].id);
        db.run('insert into binding(postId, albumName) select posts.id, ? from posts where id = ?', postsJson[key].albums[wkey], postsJson[key].id);
      }
    }
  }

  for (const key in postsJson) {
    if (postsJson[key].imageIds.length != 0) {
      var i = 0;
      for (const wkey in postsJson[key].imageIds) {
        //console.log(postsJson[key].id);
        db.run('insert into images(postId, [index], imageId) select posts.id, ?, ? from posts where id = ?', i, postsJson[key].imageIds[wkey], postsJson[key].id);
        i++;
      }
    }
  }

  for (const key in postsJson) {
	if (postsJson[key].movie) {
      //console.log(postsJson[key].id);
      db.run('insert into movies(postId, url) select posts.id, ? from posts where id = ?', postsJson[key].movie, postsJson[key].id);
    }
  }
});
