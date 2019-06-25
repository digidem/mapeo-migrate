var osmdb = require('osm-p2p')

var osm = osmdb('old/data')

osm.ready(function () {
  osm.get(process.argv[2], function (err, versions) {
    if (err) throw err
    console.log(Object.keys(versions).map(function (key) {
      return Object.assign({version:key}, versions[key])
    }))
  })
})
