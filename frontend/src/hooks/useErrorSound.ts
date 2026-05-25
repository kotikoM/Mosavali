export function useErrorSound() {
  const playError = () => {
    const ctx = new AudioContext()

    // three sharp descending beeps — loud and attention-grabbing
    const times = [0, 0.18, 0.36]
    times.forEach(t => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime + t)
      osc.frequency.setValueAtTime(660, ctx.currentTime + t + 0.08)
      gain.gain.setValueAtTime(0.6, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.15)
    })
  }

  return { playError }
}