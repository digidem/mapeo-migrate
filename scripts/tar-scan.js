var fs = require('fs')

var fd = fs.openSync(process.argv[2], 'r')

var length = fs.statSync(process.argv[2]).size

var offset = 0
var buf = Buffer.alloc(32)
while (offset < length) {
  fs.readSync(fd, buf, 0, buf.length, offset)
  offset += 512
  var readable = true
  for (var i=0; i < 15; i++) {
    if (!ascii(buf[i])) readable = false
  }
  if (readable) console.log(offset-512 + ': ' + buf.toString())
}

function ascii (ch) {
  return ch >= 32 && ch <= 126
}
