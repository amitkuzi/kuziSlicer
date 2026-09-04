import mqtt from 'mqtt'

const IP = '192.168.1.14'
const ACCESS_CODE = '11388578'
const SERIAL = '0300Da5d2800535'

const client = mqtt.connect(`mqtts://${IP}:8883`, {
  username: 'bblp',
  password: ACCESS_CODE,
  rejectUnauthorized: false,
  reconnectPeriod: 0,
  connectTimeout: 15000,
  clientId: 'kuziSlicer_' + Date.now(),
})

client.on('connect', () => {
  console.log('Connected at', new Date().toISOString())
})
client.on('close', () => console.log('Closed at', new Date().toISOString()))
client.on('error', (e) => console.log('Error:', e.message))
client.on('packetreceive', (p) => console.log('packet received:', p.cmd))
client.on('packetsend', (p) => console.log('packet sent:', p.cmd))

setTimeout(() => {
  console.log('Now subscribing...')
  client.subscribe(`device/${SERIAL}/report`, { qos: 0 }, (err, granted) => {
    console.log('Subscribe callback:', err ? err.message : 'ok', granted)
  })
}, 2000)

client.on('message', (topic, payload) => {
  console.log('--- MQTT message on', topic, '---')
  console.log(payload.toString().slice(0, 1500))
})

setTimeout(() => {
  client.end(true)
  process.exit(0)
}, 15000)
