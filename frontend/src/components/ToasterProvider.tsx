import { Toaster } from 'sonner'

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        className:
          'bg-neutral-50 border border-neutral-100 text-neutral-800 rounded-xl shadow-sm',

        style: {
          color: undefined,
        },
      }}
    />
  )
}