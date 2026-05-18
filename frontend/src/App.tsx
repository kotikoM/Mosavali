import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Scanning from './pages/Scanning'
import Printing from './pages/Printing'
import Pickers from './pages/Pickers'
import Fruits from './pages/Fruits'
import BoxTypes from './pages/BoxTypes'

export default function App() {
  return (
      <>

        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="scanning"  element={<Scanning />} />
            <Route path="printing"  element={<Printing />} />
            <Route path="pickers"   element={<Pickers />} />
            <Route path="fruits"    element={<Fruits />} />
            <Route path="box-types" element={<BoxTypes />} />
          </Route>
        </Routes>
      </>
  )
}