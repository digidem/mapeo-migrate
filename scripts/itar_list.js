var Tarball = require('indexed-tarball')

var tarball = new Tarball(process.argv[2], require('os').tmpdir())
tarball.list(function (err, names) {
  console.log(names.length)
  names.forEach(name => console.log(name))
})

