`use strict`

const express = require('express');
const process = require(`process`)

const app = express();

function setPipeSize(source, sink, size) {
    source.highWaterMark = sink.highWaterMark = size
}

app.use('*', (req, _, next) => {
    if (process.env[`DEBUG`]) {
        console.debug(req.method)
        console.debug(req.headers)
    }
    next()
})

app.get(`/radio_mp3`, (_, res) => {
    const html = '<!DOCTYPE html><html lang="en"><body>' +
        '<div>MP3<audio controls><source src="radio.mp3" type="audio/mpeg"></audio></div>' +
        '</body>'
    res.contentType(`text/html`)
    res.write(html)
    res.end()
})

app.get(`/radio_wav`, (_, res) => {
    const html = '<!DOCTYPE html><html lang="en"><body>' +
        '<div>WAV<audio controls><source src="radio.wav" type="audio/wav"></audio></div>' +
        '</body>'
    res.contentType(`text/html`)
    res.write(html)
    res.end()
})

app.get('/radio.mp3', (req, res) => {
    res.contentType(`audio/mpeg`)
    res.on(`close`, () => {
        console.debug(`MP3 stream closed!`)
    })
    res.on(`error`, err => {
        console.error(`MP3 stream error:`)
        console.error(err)
    })

    setPipeSize(process.stdin, res, 0x400) // 1 Kibibyte
    process.stdin.pipe(res)
    console.debug(`MP3 stream pipe!`)
})

app.get('/radio.wav', (req, res) => {
    res.contentType(`audio/wav`)
    res.on(`close`, () => {
        console.debug(`WAV stream closed!`)
    })
    res.on(`error`, err => {
        console.error(`WAV stream error:`)
        console.error(err)
    })

    const fileSize = 0xFFFF_FFFC
    const headerHexString = `52494646f4ffffff57415645666d7420100000000100020044ac000010b102000400100064617461d0ffffff`
    const headerBuffer = new Uint8Array(headerHexString.match(/../g).map(h=>parseInt(h,16)))

    const ranges = req.range(fileSize)
    if (process.env[`DEBUG`]) {
        console.debug(ranges)
        if (ranges !== undefined) {
            console.debug(`range from ${ranges[0].start} until ${ranges[0].end}`)
        }
    }

    res.write(headerBuffer)

    setPipeSize(process.stdin, res, 44100 * 4) // one second
    process.stdin.pipe(res)
    console.debug(`WAV stream pipe!`)
})

app.use(`/test_files`, express.static(`./test_files`))

const listener = app.listen(process.env.PORT, () => {
    console.debug(`The webserver is running and listening on port ${listener.address().port}`)
});