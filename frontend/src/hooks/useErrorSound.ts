export function useErrorSound() {
  const playError = () => {
    const ctx = new AudioContext()

    const beepTimes = [0, 0.15, 0.30, 0.45]
    beepTimes.forEach(t => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.frequency.setValueAtTime(1100, ctx.currentTime + t)
      osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + t + 0.12)

      gain.gain.setValueAtTime(1.0, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.13)

      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.13)
    })

    const rumble     = ctx.createOscillator()
    const rumbleGain = ctx.createGain()
    rumble.connect(rumbleGain)
    rumbleGain.connect(ctx.destination)
    rumble.type = 'sawtooth'
    rumble.frequency.setValueAtTime(80, ctx.currentTime)
    rumbleGain.gain.setValueAtTime(0.4, ctx.currentTime)
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    rumble.start(ctx.currentTime)
    rumble.stop(ctx.currentTime + 0.6)
  }

  return { playError }
}