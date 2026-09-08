# Real recordings, if you want them

Synthesis is what this box does, and it is most of why the drums sound like
drums. But there is a ceiling on it: a recorded snare has a room in it and a
synthesised one never will.

**To use a recording for any voice, drop the file here and name it:**

```
public/sounds/kick.wav
public/sounds/index.json     ->  add "kick" to "voices"
```

That is the whole procedure. No code changes. A voice with no file keeps its
synthesised version, and the two mix freely — a recorded kick under a
synthesised hat is a perfectly ordinary kit.

The voices are `kick`, `snare`, `hat`, `clap`, `tom` for the drum machine and
`squeak`, `toot`, `rumble`, `blast` for the fart machine.

**Keep them short and quiet.** A drum sample wants to be under about 40 KB and
trimmed hard at the front — a recording with a tenth of a second of silence
before the hit will feel late against the synthesised voices beside it. Mono
16-bit WAV at 44.1kHz is the safe format everywhere.

## Nothing is shipped here, on purpose

Audio found on the internet comes with a licence, and which licence a child's
toy may carry is not a decision to make quietly on somebody else's behalf. The
mechanism is built and tested; the files are yours to choose. CC0 and
public-domain are the safe answers.
