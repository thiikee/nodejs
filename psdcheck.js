var path = require('path');
var PSD = require('psd');
var psd = PSD.fromFile(path.resolve(process.argv[2]));
psd.parse();
//console.log(psd.tree().export());
layer(psd.tree().root(), 0);

function layer(n, d) {
  if (!n.children()) return;
  if (n.type != 'root')
    console.log(' '.repeat(d - 1) + n.type + '/' + n.name);
  //if (n.name == '用紙')
  //  console.log(n);
  //if (n.name == '赤み')
  //  console.log(n);
  var sd = d + 1;
  n.children().forEach((v) => {
    layer(v, sd);
  });
}
