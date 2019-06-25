var fs = require('fs')
var str = fs.readFileSync('duplicates.json').toString()
var data = JSON.parse(str)
var keys = Object.keys(data)
var total = 0
keys.forEach(function (k) {
  var val = data[k]
  console.log(JSON.stringify(val, null, 2))
  total += val.length
})
console.log(total)
