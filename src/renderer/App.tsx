import React, { useEffect, useState } from 'react'
import { SplashScreen } from './components/SplashScreen'
import { MainWindow } from './components/MainWindow'
import { ConfigWizard } from './components/ConfigWizard'

export const App: React.FC = () => {
  const [appReady, setAppReady] = useState(false)
  const [wizardCompleted, setWizardCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    if (!appReady) return
    const checkWizard = async () => {
      try {
        const completed = await window.electron.invoke('settings:get', 'wizardCompleted')
        setWizardCompleted(Boolean(completed))
      } catch (err) {
        console.error('Error checking wizard state:', err)
        setWizardCompleted(true)
      }
    }
    checkWizard()
  }, [appReady])

  if (!appReady) {
    return <SplashScreen onComplete={() => setAppReady(true)} />
  }

  if (wizardCompleted === null) {
    return null
  }

  if (!wizardCompleted) {
    return <ConfigWizard onComplete={() => setWizardCompleted(true)} />
  }

  return <MainWindow />
}
