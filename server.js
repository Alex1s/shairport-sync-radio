`use strict`

const express = require('express')
const process = require(`process`)
const fs = require(`fs`)

const app = express()

const fileSize = 0xFFFF_FFFC
const headerHexString = `52494646f4ffffff57415645666d7420100000000100020044ac000010b102000400100064617461d0ffffff`
const headerBuffer = new Uint8Array(headerHexString.match(/../g).map(h=>parseInt(h,16)))
const totalBytesToSend = process.env.TOTAL_BYTES_TO_SEND || 4096
const streamPath = process.env.STREAM_PATH || `/tmp/shairport-sync-audio`
const errorTimeout = isNaN(parseInt(process.env.ERROR_TIMEOUT)) ? 5 : parseInt(process.env.ERROR_TIMEOUT)
const readSampleBufferSize = isNaN(parseInt(process.env.READ_SAMPLE_BUFFER_SIZE)) ? 4 : parseInt(process.env.READ_SAMPLE_BUFFER_SIZE)

let stream = null

async function createStream() {
    const s = fs.createReadStream(streamPath, {autoClose: false, highWaterMark: 4 * readSampleBufferSize}) // just one sample 16 bits per channel
    s.addListener(`ready`, () => console.log(`The stream is ready!`))
    s.addListener(`open`, () => console.log(`The stream is open!`))
    s.addListener(`close`, () => console.log(`The stream is closed!`))
    s.addListener(`end`, async () => {
        console.log(`The stream has ended! Thus we have to re-open it.`)
        stream = await createStream()
    })
    s.addListener(`error`, async (error) => {
        console.log(`The stream has an error! We will retry in ${errorTimeout} seconds.`)
        console.log(error)
        await new Promise(resolve => setTimeout(resolve, errorTimeout * 1000))
        console.log(`Retrying now ...`)
        stream = await createStream()
    })

    return s
};

(async () => {
    stream = await createStream()
    console.log(`'stream' variable is set!`)
})()


app.get('/radio.wav', (req, res) => {
    console.debug(req.method)
    console.debug(req.headers)

    res.contentType(`audio/wav`)

    res.on(`close`, () => {
        console.debug(`WAV stream closed!`)
    })
    res.on(`error`, err => {
        console.error(`WAV stream error:`)
        console.error(err)
    })


    const ranges = req.range(fileSize)
    if (!ranges) {
        console.debug(`res.writableHighWaterMark: ${res.writableHighWaterMark}`)
        console.debug(`No range specified. Just sending wav header followed with some trash bytes to send in total ${totalBytesToSend}. Connection is not closed as this should be done by the AMP.`)

        // we send in total (with the header) 4096 bytes
        // if we send less the AMP does not close the connection and sends a new request with a bytes=44-0 header
        // not sure if 4096 this is related to Express, node.js, the (linux) kerel, the NIC or the AMP
        // so try around with this value if the AMP does not follow
        res.write(headerBuffer)
        res.write(`0`.repeat(totalBytesToSend - headerBuffer.byteLength))
    } else if (ranges) { // this should be the AMP
        console.assert(ranges)
        console.assert(ranges[0])
        console.assert(ranges[0].start === 44)
        console.assert(ranges[0].end === fileSize - 1)

        res.setHeader(`Content-Range`, `bytes 44-${fileSize - 1}/${fileSize}`)

        while (true) {
            const data = stream.read()
            if (data === null) {
                console.log(`Done trashing data.`)
                break
            }
            console.log(`Trashing ${Buffer.byteLength(data)} bytes of data.`)
        }

        stream.pipe(res, {end: false}) // end = false so if shairport-sync stopps, stream is not
        // ended but just no data will be sent, causing amp to close connection and retry connecting
        console.debug(`WAV stream pipe!`)
    }
})

const listener = app.listen(process.env.PORT, () => {
    console.debug(`The webserver is running and listening on port ${listener.address().port}`)
})