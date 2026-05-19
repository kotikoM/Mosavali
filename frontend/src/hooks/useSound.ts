export function useSound() {
  const play = (type: 'success' | 'error') => {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      // two ascending tones
      oscillator.frequency.setValueAtTime(523, ctx.currentTime)        // C5
      oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.12) // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.35)
    } else {
      // two descending tones
      oscillator.frequency.setValueAtTime(440, ctx.currentTime)        // A4
      oscillator.frequency.setValueAtTime(330, ctx.currentTime + 0.12) // E4
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.35)
    }
  }

  return { play }
}