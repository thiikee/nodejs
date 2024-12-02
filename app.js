const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const sqlite3 = require("sqlite3");
app.use(express.static('../thiikee.github.io'));

//app.use((req, res, next) => {
//  res.header('Access-Control-Allow-Origin', '*');
//  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//  next();
//});

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.get('/api/v1/types', (req, res) => {
  db.all("SELECT * from types", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/women', (req, res) => {
  db.all("SELECT * from women ORDER BY phoneticName", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/artists', (req, res) => {
  db.all("SELECT * from artists ORDER BY phoneticName", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/tags', (req, res) => {
  db.all("SELECT * from tags ORDER BY phoneticName", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/albums', (req, res) => {
  db.all("SELECT name from albums", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/aliases', (req, res) => {
  db.all("SELECT * from aliases", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/posts', (req, res) => {
  var where = '';
  if (req.query.title && req.query.title.length > 0) {
    where += ` AND a.title LIKE '%${req.query.title}%'`;
  }
  if (req.query.type && req.query.type.length > 0) {
    where += ` AND a.type = '${req.query.type}'`;
  }
  console.log(req.query.love);
  if (req.query.love && req.query.love.length > 0) {
    where += ` AND a.love = 1`;
  }
  if (req.query.keeping) {
    if (!req.query.discarded) {
      where += ` AND (a.discarded IS NULL OR a.discarded = 0)`;
    }
  } else {
    if (req.query.discarded) {
      where += ` AND (a.discarded = 1)`;
    } else {
      where += ` AND (1 = 0)`;
    }
  }
  var orderBy = 'createdAt';
  if (req.query.orderBy && req.query.orderBy.length > 0) {
    orderBy = req.query.orderBy;
  }
  var ascending = "DESC";
  if (req.query.ascending && req.query.ascending.length > 0) {
    ascending = "ASC";
  }
  console.log('orderBy=' + orderBy);
  var womenJoin = '';
  if (req.query.women) {
    var a = req.query.women.split(',');
    for (i = 0; i < a.length; i++) {
      womenJoin += `
        INNER JOIN [cast] AS cast_${i} ON posts.id = cast_${i}.postId AND cast_${i}.womanName IN (
          SELECT '${a[i]}' UNION
          SELECT alias FROM aliases WHERE name = '${a[i]}' UNION
          SELECT name FROM aliases WHERE alias = '${a[i]}'
        ) `;
    }
  }

  var artistJoin = '';
  if (req.query.artists) {
    var a = req.query.artists.split(',');
    for (i = 0; i < a.length; i++) {
      artistJoin += `
        INNER JOIN [work] AS work_${i} ON posts.id = work_${i}.postId AND work_${i}.artistName IN (
          SELECT '${a[i]}' UNION
          SELECT alias FROM aliases WHERE name = '${a[i]}' UNION
          SELECT name FROM aliases WHERE alias = '${a[i]}'
        ) `;
    }
  }

  var tagsJoin = '';
  if (req.query.tags) {
    var a = req.query.tags.split(',');
    for (i = 0; i < a.length; i++) {
      tagsJoin += `INNER JOIN v_tagging AS v_tagging_${i} ON posts.id = v_tagging_${i}.postId AND v_tagging_${i}.name = '${a[i]}' `;
    }
  }

  var albumJoin = '';
  if (req.query.album) {
    albumJoin += `INNER JOIN v_binding ON posts.id = v_binding.postId AND v_binding.name = '${req.query.album}' `;
  }

  var offset = req.query.offset;
  var limit = req.query.limit;

  var query = `
SELECT
  a.*,
  b.women,
  e.artists,
  c.tags,
  d.albums
 FROM (
  SELECT
    posts.*
  FROM posts
  ${womenJoin}
  ${artistJoin}
  ${tagsJoin}
  ${albumJoin}
) a
LEFT OUTER JOIN (
  SELECT
    postId,
    json_group_array(womanName) AS women
  FROM [cast]
  GROUP BY postId
) b ON a.id = b.postId
LEFT OUTER JOIN (
  SELECT
    postId,
    json_group_array(artistName) AS artists
  FROM [work]
  GROUP BY postId
) e ON a.id = e.postId
LEFT OUTER JOIN (
  SELECT
    postId,
    json_group_array(name) AS tags
  FROM v_tagging
  GROUP BY postId
) c ON a.id = c.postId
LEFT OUTER JOIN (
  SELECT
    postId,
    json_group_array(name) AS albums
  FROM v_binding
  GROUP BY postId
) d ON a.id = d.postId
WHERE 1 = 1 ${where}
ORDER BY a.${orderBy} ${ascending}, a.title
LIMIT ${limit}
OFFSET ${offset}
`;
  //console.log(query);
  db.all(query, (err, rows) => {
    //console.log(`${rows.length} rows found.`);
    res.json(rows.map((r) => {
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        women: r.women,
        artists: r.artists,
        tags: r.tags,
        albums: r.albums,
        images: getImages(r),
        movies: getMovies(r),
        comment: r.comment,
        alt: r.alt,
        love: r.love,
        discarded: r.discarded,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }
    }));
  });
});

app.get('/api/v1/cast', (req, res) => {
  db.all("SELECT women.* from women", (err, rows) => {
    res.json(rows);
  });
});

app.get('/api/v1/images/:name', function(req, res) {
  var files = fs.readdirSync(`./public/${req.query.type}`, { withFileTypes: true }).filter(d => d.name.match(new RegExp(`^${req.params.name}(\.(jpg|gif|png))?$`)));
  if (files.length == 0) {
    console.log('not found');
    res.json(files);
  } else {
    var file = files[0];
    if (file.isFile()) {
      res.json([`/${req.query.type}/${file.name}`]);
    } else {
      files = fs.readdirSync(`./public/${req.query.type}/${file.name}`);
      res.json(files.filter(f => !f.match(/\.(mp4|mkv)$/)).map(f => `/${req.query.type}/${file.name}/${f}`));
    }
  }
});

app.get('/api/v1/movies/:name', function(req, res) {
  try {
    var files = fs.readdirSync(`./public/${req.query.type}/${req.params.name}/m`);
    res.json(files.filter(f => f.match(/\.(mp4|mkv)$/)).map(f => `/${req.query.type}/${req.params.name}/m/${f}`));
  } catch {
    res.json([]);
  }
});

app.post('/api/v1/post', function(req, res) {
  //console.log(req.body);
  db.serialize(() => {
    if (req.body.id > 0) {
      db.run(`
        UPDATE posts SET
          title = '${(req.body.fields) ? req.body.fields.title : req.body.title}',
          type = '${(req.body.fields) ? req.body.fields.type : req.body.type}',
          love = ${(req.body.fields) ? req.body.fields.love : req.body.love},
          comment = '${(req.body.fields) ? req.body.fields.comment : req.body.comment}',
          alt = '${(req.body.fields) ? req.body.fields.alt : req.body.alt}',
          discarded = ${(req.body.fields) ? req.body.fields.discarded : req.body.discarded},
          updatedAt = strftime('%s', 'now')
        WHERE
          id = ${req.body.id}`, () => {
            res.send(req.body);
          }
      );
      updateRelations(req.body.id, (req.body.fields ? req.body.fields : req.body));
    } else {
      db.run(`
        INSERT INTO posts (title, type, createdAt, updatedAt, comment, alt) VALUES (
          '${(req.body.fields) ? req.body.fields.title : req.body.title}',
          '${(req.body.fields) ? req.body.fields.type : req.body.type}',
          strftime('%s', 'now'),
          strftime('%s', 'now'),
          '${(req.body.fields) ? req.body.fields.comment : req.body.comment}',
          '${(req.body.fields) ? req.body.fields.alt : req.body.alt}'
        )`
      );
      db.get('SELECT id FROM posts ORDER BY rowid DESC LIMIT 1', (err, row) => {
        console.log(`row=${row.id}`);
        req.body.id = row.id;
        res.send(req.body);
        updateRelations(row.id, (req.body.fields ? req.body.fields : req.body));
      });
    }
  });
});

app.post('/api/v1/woman', (req, res) => {
  console.log(req.body);
  db.run(`INSERT INTO women (name, phoneticName) VALUES ('${req.body.name}', '${req.body.phoneticName}');`);
  res.send('OK');
});

app.post('/api/v1/artist', (req, res) => {
  console.log(req.body);
  db.run(`INSERT INTO artists (name, phoneticName) VALUES ('${req.body.name}', '${req.body.phoneticName}');`);
  res.send('OK');
});

app.post('/api/v1/tag', (req, res) => {
  console.log(req.body);
  db.run(`INSERT INTO tags (name, phoneticName) VALUES ('${req.body.name}', '${req.body.phoneticName}');`);
  res.send('OK');
});

app.listen(3000, () => console.log('Listening on port 3000'));

function updateRelations(id, req) {
  db.serialize(() => {
    db.run(`DELETE FROM [cast] WHERE postId = ${id}`);
    if (req.women) {
      req.women.forEach((v, i, a) => {
        //console.log(v);
        db.run(`INSERT INTO [cast] VALUES (${id}, '${v}')`);
      });
    }
  });
  db.serialize(() => {
    db.run(`DELETE FROM [work] WHERE postId = ${id}`);
    if (req.artists) {
      req.artists.forEach((v, i, a) => {
        //console.log(v);
        db.run(`INSERT INTO [work] VALUES (${id}, '${v}')`);
      });
    }
  });
  db.serialize(() => {
    db.run(`DELETE FROM tagging WHERE postId = ${id}`);
    if (req.tags) {
      req.tags.forEach((v, i, a) => {
        db.run(`INSERT INTO tagging SELECT ${id}, id FROM tags WHERE name = '${v}'`);
      });
    }
  });
  db.serialize(() => {
    db.run(`DELETE FROM binding WHERE postId = ${id}`);
    if (req.albums) {
      req.albums.forEach((v, i, a) => {
        db.run(`INSERT INTO binding SELECT ${id}, id FROM albums WHERE name = '${v}'`);
      });
    }
  });
}

function getImages(row) {
  if (row.url) return [row.url];
  var name = row.alt ? row.alt : row.title;
  var files = fs.readdirSync(`./public/${row.type}`, { withFileTypes: true }).filter(d => d.name.match(new RegExp(`^${name}(\.(jpg|gif|png))?$`)));
  if (files.length == 0) {
    console.log('not found');
    return [];
  } else {
    var file = files[0];
    if (file.isFile()) {
      return [`/${row.type}/${file.name}`];
    } else {
      files = fs.readdirSync(`./public/${row.type}/${file.name}`);
      return files.filter(f => !f.match(/\.(mp4|mkv)$/)).map(f => `/${row.type}/${file.name}/${f}`);
    }
  }
}

function getMovies(row) {
  try {
    var name = row.alt ? row.alt : row.title;
    var files = fs.readdirSync(`./public/${row.type}/${name}/m`);
    return files.filter(f => f.match(/\.(mp4|mkv)$/)).map(f => `/${req.query.type}/${req.params.name}/m/${f}`);
  } catch {
    return [];
  }
}
