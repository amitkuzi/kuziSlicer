import * as ftp from 'basic-ftp'
import { Readable } from 'stream'
import fs from 'fs'

const buf = fs.readFileSync('src/data/bambu-project-template.gcode.3mf')
console.log('Buffer size:', buf.length)

const client = new ftp.Client(20000)
client.ftp.verbose = true
try {
  console.log('Connecting...')
  await client.access({
    host: '192.168.1.14', port: 990, user: 'bblp', password: '11388578',
    secure: 'implicit', secureOptions: { rejectUnauthorized: false },
  })
  console.log('Connected. Uploading via Readable.from(buffer)...')
  const start = Date.now()
  await client.uploadFrom(Readable.from(buf), 'kuziSlicer_test_upload.gcode.3mf')
  console.log('Upload done in', Date.now() - start, 'ms')
} catch (err) {
  console.error('ERROR:', err)
} finally {
  client.close()
}
