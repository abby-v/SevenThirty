import { useRef, useState } from 'react'

export function useToast(): [string, (msg: string) => void] {
  const [msg, setMsg] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = (m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 3500)
  }
  return [msg, show]
}
