import * as ftp from 'basic-ftp'
const client = new ftp.Client(15000)
await client.access({
  host: '192.168.1.14', port: 990, user: 'bblp', password: '11388578',
  secure: 'implicit', secureOptions: { rejectUnauthorized: false },
})
await client.downloadTo('D:/Development/kuziSlicer/scratch-sample.gcode.3mf', 'nakretka+m8.gcode.3mf')
client.close()
console.log('downloaded')
