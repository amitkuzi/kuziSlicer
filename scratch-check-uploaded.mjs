import * as ftp from 'basic-ftp'
const client = new ftp.Client(15000)
await client.access({
  host: '192.168.1.14', port: 990, user: 'bblp', password: '11388578',
  secure: 'implicit', secureOptions: { rejectUnauthorized: false },
})
const list = await client.list()
console.log(list.filter(f => f.name.includes('kuziSlicer')).map(f => `${f.name} (${f.size} bytes, ${f.modifiedAt})`))
client.close()
