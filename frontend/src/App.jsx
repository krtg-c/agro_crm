import { useEffect, useState } from 'react'
import axios from 'axios'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'

const API = 'http://localhost:8000'

function App() {
  const [objects, setObjects] = useState([])
  const [selected, setSelected] = useState([])
  const [route, setRoute] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get(`${API}/map/objects`)
      .then((res) => setObjects(res.data))
      .catch((err) => {
        console.error(err)
        setError('Не удалось загрузить объекты карты')
      })
  }, [])

  const handleSelect = (obj) => {
    if (selected.length === 2) {
      setSelected([obj])
      setRoute(null)
      return
    }
    setSelected([...selected, obj])
  }

  const buildRoute = async () => {
    if (selected.length !== 2) {
      setError('Нужно выбрать 2 объекта')
      return
    }

    setError('')

    try {
      const res = await axios.post(`${API}/route/by-object`, {
        from_object_type: selected[0].type,
        from_object_id: selected[0].id,
        to_object_type: selected[1].type,
        to_object_id: selected[1].id,
        rate_rub_per_km: 50,
        fixed_costs: 0,
      })

      setRoute(res.data)
    } catch (err) {
      console.error(err)
      setError('Не удалось построить маршрут')
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Панель управления */}
      <div style={{
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        background: '#fff',
        zIndex: 1000,
        position: 'relative'
      }}>
        <button onClick={buildRoute}>Построить маршрут</button>

        <div>Выбрано: {selected.length}</div>

        {route && (
          <>
            <div>Distance: {route.distance_km} km</div>
            <div>Cost: {route.cost_rub} RUB</div>
          </>
        )}

        {error && <div style={{ color: 'red' }}>{error}</div>}
      </div>

      {/* Карта */}
      <MapContainer
        center={[55.75, 37.61]}
        zoom={10}
        style={{ height: '85vh', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer
          attribution="© OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Маркеры */}
        {objects
          .filter((obj) => obj.lat !== null && obj.lon !== null)
          .map((obj) => (
            <Marker
              key={`${obj.type}-${obj.id}`}
              position={[obj.lat, obj.lon]}
              eventHandlers={{
                click: () => handleSelect(obj),
              }}
            >
              <Popup>
                <div>
                  <div><b>{obj.name}</b></div>
                  <div>Type: {obj.type}</div>
                  <div>{obj.address}</div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Линия маршрута */}
        {route && (
          <Polyline
            positions={[
              [route.from_point.lat, route.from_point.lon],
              [route.to_point.lat, route.to_point.lon],
            ]}
          />
        )}
      </MapContainer>

      {/* Кастомная атрибуция */}
      <div style={{
        position: 'absolute',
        bottom: 5,
        right: 10,
        fontSize: 10,
        background: 'rgba(255,255,255,0.7)',
        padding: '2px 6px',
        borderRadius: 4,
        zIndex: 1000
      }}>
        © OpenStreetMap
      </div>
    </div>
  )
}

export default App