import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  MapContainer,
  TileLayer,
  Popup,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet'

const API = 'http://localhost:8000'

function FitToObjects({ objects }) {
  const map = useMap()

  useEffect(() => {
    if (!objects.length) return

    const bounds = objects.map((obj) => [obj.lat, obj.lon])
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [objects, map])

  return null
}

function FitToRoute({ geometry }) {
  const map = useMap()

  useEffect(() => {
    if (!geometry || !geometry.length) return

    const bounds = geometry.map(([lon, lat]) => [lat, lon])
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [geometry, map])

  return null
}

function App() {
  const [objects, setObjects] = useState([])
  const [route, setRoute] = useState(null)
  const [error, setError] = useState('')

  const [filterType, setFilterType] = useState('all')

  const [fromObject, setFromObject] = useState(null)
  const [toObject, setToObject] = useState(null)

  useEffect(() => {
    axios
      .get(`${API}/map/objects`)
      .then((res) => {
        setObjects(res.data)
      })
      .catch((err) => {
        console.error(err)
        setError('Не удалось загрузить объекты карты')
      })
  }, [])

  const validObjects = useMemo(() => {
    return objects.filter((obj) => obj.lat !== null && obj.lon !== null)
  }, [objects])

  const filteredObjects = useMemo(() => {
    if (filterType === 'all') return validObjects
    return validObjects.filter((obj) => obj.type === filterType)
  }, [validObjects, filterType])

  const handleSelect = (obj) => {
    setError('')

    if (!fromObject) {
      setFromObject(obj)
      return
    }

    if (!toObject) {
      if (fromObject.type === obj.type && fromObject.id === obj.id) {
        setError('Нельзя выбрать один и тот же объект дважды')
        return
      }
      setToObject(obj)
      return
    }

    setFromObject(obj)
    setToObject(null)
    setRoute(null)
  }

  const buildRoute = async () => {
    if (!fromObject || !toObject) {
      setError('Нужно выбрать 2 объекта')
      return
    }

    setError('')

    try {
      const res = await axios.post(`${API}/route/by-object`, {
        from_object_type: fromObject.type,
        from_object_id: fromObject.id,
        to_object_type: toObject.type,
        to_object_id: toObject.id,
        rate_rub_per_km: 50,
        fixed_costs: 0,
      })

      setRoute(res.data)
    } catch (err) {
      console.error(err)
      setError('Не удалось построить маршрут')
    }
  }

  const clearSelection = () => {
    setFromObject(null)
    setToObject(null)
    setRoute(null)
    setError('')
  }

  const getColor = (type) => {
    if (type === 'burt') return '#2563eb'
    if (type === 'receiving_point') return '#dc2626'
    return '#6b7280'
  }

  const isSelected = (obj) => {
    return (
      (fromObject && fromObject.type === obj.type && fromObject.id === obj.id) ||
      (toObject && toObject.type === obj.type && toObject.id === obj.id)
    )
  }

  const formatType = (type) => {
    if (type === 'burt') return 'Бурт'
    if (type === 'receiving_point') return 'Точка приёмки'
    return type
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          padding: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          background: '#fff',
          zIndex: 1000,
          position: 'relative',
          flexWrap: 'wrap',
        }}
      >
        <button onClick={buildRoute}>Построить маршрут</button>
        <button onClick={clearSelection}>Сбросить</button>

        <label>
          Тип:
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ marginLeft: 6 }}
          >
            <option value="all">Все</option>
            <option value="burt">Только бурты</option>
            <option value="receiving_point">Только точки приёмки</option>
          </select>
        </label>

        <div>Объектов на карте: {filteredObjects.length}</div>

        <div>
          Откуда:{' '}
          <b>{fromObject ? `${fromObject.name} (${formatType(fromObject.type)})` : 'не выбрано'}</b>
        </div>

        <div>
          Куда:{' '}
          <b>{toObject ? `${toObject.name} (${formatType(toObject.type)})` : 'не выбрано'}</b>
        </div>

        {route && (
          <>
            <div>Расстояние: <b>{route.distance_km} км</b></div>
            <div>Стоимость: <b>{route.cost_rub} ₽</b></div>
          </>
        )}

        {error && <div style={{ color: 'red' }}>{error}</div>}
      </div>

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

        {!route && <FitToObjects objects={filteredObjects} />}
        {route && route.geometry && <FitToRoute geometry={route.geometry} />}

        {filteredObjects.map((obj) => (
          <CircleMarker
            key={`${obj.type}-${obj.id}`}
            center={[obj.lat, obj.lon]}
            radius={isSelected(obj) ? 14 : 10}
            pathOptions={{
              color: isSelected(obj) ? '#111827' : '#ffffff',
              weight: isSelected(obj) ? 3 : 2,
              fillColor: getColor(obj.type),
              fillOpacity: 0.95,
            }}
            eventHandlers={{
              click: () => handleSelect(obj),
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              {obj.name}
            </Tooltip>

            <Popup>
              <div>
                <div><b>{obj.name}</b></div>
                <div>Тип: {formatType(obj.type)}</div>
                <div>{obj.address}</div>
                <div>lat: {obj.lat}</div>
                <div>lon: {obj.lon}</div>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => handleSelect(obj)}>
                    Выбрать
                  </button>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {route && route.geometry && (
          <Polyline
            positions={route.geometry.map(([lon, lat]) => [lat, lon])}
            pathOptions={{ color: '#2563eb', weight: 5 }}
          />
        )}
      </MapContainer>

      <div
        style={{
          position: 'absolute',
          bottom: 5,
          right: 10,
          fontSize: 10,
          background: 'rgba(255,255,255,0.7)',
          padding: '2px 6px',
          borderRadius: 4,
          zIndex: 1000,
        }}
      >
        © OpenStreetMap
      </div>
    </div>
  )
}

export default App