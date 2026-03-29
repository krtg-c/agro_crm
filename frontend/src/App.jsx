import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  CircleMarker,
  MapContainer,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'

const API = `http://${window.location.hostname}:8000`
const HISTORY_LIMIT = 12

const EMPTY_FORM = {
  mode: 'create',
  objectType: 'burt',
  id: null,
  crmId: '',
  name: '',
  address: '',
  lat: '',
  lon: '',
  category: '',
  quality: '',
  volume: '',
  status: '',
  pointType: '',
}

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
    if (!geometry?.length) return

    const bounds = geometry.map(([lon, lat]) => [lat, lon])
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [geometry, map])

  return null
}

function formatType(type) {
  if (type === 'burt') return 'Бурт'
  if (type === 'receiving_point') return 'Точка приемки'
  return type
}

function formatDate(value) {
  if (!value) return 'Неизвестно'

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatHistoryName(item, side) {
  const displayName =
    side === 'from' ? item.from_display_name : item.to_display_name
  const address = side === 'from' ? item.from_address : item.to_address

  return displayName || address
}

function objectKey(object) {
  return `${object.type}-${object.id}`
}

function objectToForm(object) {
  return {
    mode: 'edit',
    objectType: object.type,
    id: object.id,
    crmId: object.crm_id || '',
    name: object.name || '',
    address: object.address || '',
    lat: object.lat ?? '',
    lon: object.lon ?? '',
    category: object.category || '',
    quality: object.quality || '',
    volume: object.volume ?? '',
    status: object.status || '',
    pointType: object.point_type || '',
  }
}

function buildPayload(form) {
  const payload = {
    crm_id: form.crmId.trim() || null,
    name: form.name.trim(),
    address: form.address.trim(),
    lat: String(form.lat).trim() ? Number(form.lat) : null,
    lon: String(form.lon).trim() ? Number(form.lon) : null,
  }

  if (form.objectType === 'burt') {
    payload.category = form.category.trim() || null
    payload.quality = form.quality.trim() || null
    payload.volume = String(form.volume).trim() ? Number(form.volume) : null
    payload.status = form.status.trim() || null
  } else {
    payload.point_type = form.pointType.trim() || null
  }

  return payload
}

function objectMatchesQuery(object, query) {
  if (!query) return true

  const haystack = [
    object.name,
    object.address,
    object.crm_id,
    object.category,
    object.quality,
    object.status,
    object.point_type,
    formatType(object.type),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

function App() {
  const [objects, setObjects] = useState([])
  const [route, setRoute] = useState(null)
  const [history, setHistory] = useState([])

  const [pageError, setPageError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const [isLoadingObjects, setIsLoadingObjects] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isBuildingRoute, setIsBuildingRoute] = useState(false)
  const [isSubmittingObject, setIsSubmittingObject] = useState(false)
  const [isDeletingObject, setIsDeletingObject] = useState(false)

  const [filterType, setFilterType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [fromObject, setFromObject] = useState(null)
  const [toObject, setToObject] = useState(null)
  const [activeObjectKey, setActiveObjectKey] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const validObjects = useMemo(() => {
    return objects.filter((obj) => obj.lat !== null && obj.lon !== null)
  }, [objects])

  const filteredObjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return validObjects.filter((obj) => {
      const typeMatch = filterType === 'all' || obj.type === filterType
      return typeMatch && objectMatchesQuery(obj, normalizedQuery)
    })
  }, [validObjects, filterType, searchQuery])

  async function loadObjects() {
    setIsLoadingObjects(true)
    setPageError('')

    try {
      const res = await axios.get(`${API}/map/objects`)
      setObjects(res.data)
    } catch (err) {
      console.error(err)
      setPageError('Не удалось загрузить объекты карты')
    } finally {
      setIsLoadingObjects(false)
    }
  }

  async function loadHistory() {
    setIsLoadingHistory(true)
    setHistoryError('')

    try {
      const res = await axios.get(`${API}/routes/history`, {
        params: { limit: HISTORY_LIMIT },
      })
      setHistory(res.data)
    } catch (err) {
      console.error(err)
      setHistoryError('Не удалось загрузить историю маршрутов')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  async function refreshData() {
    await Promise.all([loadObjects(), loadHistory()])
  }

  useEffect(() => {
    void refreshData()
  }, [])

  const activeObject = useMemo(() => {
    return filteredObjects.find((obj) => objectKey(obj) === activeObjectKey) || null
  }, [activeObjectKey, filteredObjects])

  const selectedObjectIds = useMemo(() => {
    return new Set(
      [fromObject, toObject]
        .filter(Boolean)
        .map((value) => objectKey(value))
        .concat(activeObjectKey ? [activeObjectKey] : []),
    )
  }, [activeObjectKey, fromObject, toObject])

  function setFormField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function startCreate(type = form.objectType) {
    setForm({
      ...EMPTY_FORM,
      objectType: type,
    })
    setFormError('')
    setFormSuccess('')
  }

  function startEdit(object) {
    setActiveObjectKey(objectKey(object))
    setForm(objectToForm(object))
    setFormError('')
    setFormSuccess('')
  }

  function selectObjectForRoute(object) {
    setPageError('')
    setActiveObjectKey(objectKey(object))

    if (!fromObject) {
      setFromObject(object)
      return
    }

    if (!toObject) {
      if (fromObject.type === object.type && fromObject.id === object.id) {
        setPageError('Нельзя выбрать один и тот же объект дважды')
        return
      }
      setToObject(object)
      return
    }

    setFromObject(object)
    setToObject(null)
    setRoute(null)
  }

  function clearSelection() {
    setFromObject(null)
    setToObject(null)
    setRoute(null)
    setPageError('')
  }

  async function buildRouteBetween(startObject, endObject) {
    if (!startObject || !endObject) {
      setPageError('Нужно выбрать 2 объекта')
      return
    }

    setIsBuildingRoute(true)
    setPageError('')

    try {
      const res = await axios.post(`${API}/route/by-object`, {
        from_object_type: startObject.type,
        from_object_id: startObject.id,
        to_object_type: endObject.type,
        to_object_id: endObject.id,
        rate_rub_per_km: 50,
        fixed_costs: 0,
      })

      setRoute(res.data)
      await loadHistory()
    } catch (err) {
      console.error(err)
      setPageError('Не удалось построить маршрут')
    } finally {
      setIsBuildingRoute(false)
    }
  }

  async function submitObject(event) {
    event.preventDefault()
    setFormError('')
    setFormSuccess('')

    if (!form.name.trim() || !form.address.trim()) {
      setFormError('Заполните название и адрес объекта')
      return
    }

    setIsSubmittingObject(true)

    try {
      const payload = buildPayload(form)
      const isBurt = form.objectType === 'burt'
      const basePath = isBurt ? '/objects/burts' : '/objects/receiving-points'
      const method = form.mode === 'edit' ? 'put' : 'post'
      const url =
        form.mode === 'edit' ? `${API}${basePath}/${form.id}` : `${API}${basePath}`

      const res = await axios({
        method,
        url,
        data: payload,
      })

      const saved = {
        ...res.data,
        type: form.objectType,
      }

      await loadObjects()
      setFilterType('all')
      setActiveObjectKey(objectKey(saved))
      setFromObject(saved)
      setToObject(null)
      setRoute(null)
      setForm(objectToForm(saved))
      setFormSuccess(
        form.mode === 'edit'
          ? `${formatType(saved.type)} обновлен`
          : `${formatType(saved.type)} создан и добавлен на карту`,
      )
    } catch (err) {
      console.error(err)
      const message =
        err.response?.data?.detail || 'Не удалось сохранить объект'
      setFormError(String(message))
    } finally {
      setIsSubmittingObject(false)
    }
  }

  async function removeObject() {
    if (form.mode !== 'edit' || !form.id) return

    const confirmed = window.confirm('Удалить этот объект?')
    if (!confirmed) return

    setIsDeletingObject(true)
    setFormError('')
    setFormSuccess('')

    try {
      const basePath =
        form.objectType === 'burt' ? '/objects/burts' : '/objects/receiving-points'
      await axios.delete(`${API}${basePath}/${form.id}`)

      if (fromObject?.id === form.id && fromObject?.type === form.objectType) {
        setFromObject(null)
      }
      if (toObject?.id === form.id && toObject?.type === form.objectType) {
        setToObject(null)
      }
      if (activeObjectKey === `${form.objectType}-${form.id}`) {
        setActiveObjectKey(null)
      }

      setRoute(null)
      startCreate(form.objectType)
      setFormSuccess('Объект удален')
      await refreshData()
    } catch (err) {
      console.error(err)
      const message = err.response?.data?.detail || 'Не удалось удалить объект'
      setFormError(String(message))
    } finally {
      setIsDeletingObject(false)
    }
  }

  async function repeatHistoryRoute(item) {
    if (
      !item.from_object_type ||
      !item.from_object_id ||
      !item.to_object_type ||
      !item.to_object_id
    ) {
      setPageError('Этот маршрут нельзя повторить: не хватает ссылок на объекты')
      return
    }

    const startObject = validObjects.find(
      (obj) =>
        obj.type === item.from_object_type && obj.id === item.from_object_id,
    )
    const endObject = validObjects.find(
      (obj) => obj.type === item.to_object_type && obj.id === item.to_object_id,
    )

    if (!startObject || !endObject) {
      setPageError('Не удалось найти объекты из истории на карте')
      return
    }

    setFromObject(startObject)
    setToObject(endObject)
    setActiveObjectKey(objectKey(startObject))
    await buildRouteBetween(startObject, endObject)
  }

  function openObjectFromList(object) {
    setActiveObjectKey(objectKey(object))
    startEdit(object)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <section className="panel panel-hero">
          <div className="eyebrow">АгроCRM24 Geo</div>
          <h1>Карта объектов и маршрутов</h1>
          <p>
            Управляйте буртами и точками приемки в одном интерфейсе: создавайте,
            редактируйте, удаляйте, ищите объекты и стройте маршруты без перехода в
            Swagger.
          </p>
        </section>

        <section className="panel panel-route">
          <div className="panel-header">
            <h2>Маршрут</h2>
            <button className="ghost-button" onClick={() => void refreshData()}>
              Обновить
            </button>
          </div>

          <div className="action-row">
            <button onClick={() => void buildRouteBetween(fromObject, toObject)} disabled={isBuildingRoute}>
              {isBuildingRoute ? 'Строим маршрут...' : 'Построить'}
            </button>
            <button className="ghost-button" onClick={clearSelection}>
              Сбросить
            </button>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>На карте</span>
              <strong>{filteredObjects.length}</strong>
            </div>
            <div className="stat-card">
              <span>Всего объектов</span>
              <strong>{validObjects.length}</strong>
            </div>
          </div>

          <div className="selection-card">
            <div>
              <span>Откуда</span>
              <strong>
                {fromObject
                  ? `${fromObject.name} (${formatType(fromObject.type)})`
                  : 'Не выбрано'}
              </strong>
            </div>
            <div>
              <span>Куда</span>
              <strong>
                {toObject
                  ? `${toObject.name} (${formatType(toObject.type)})`
                  : 'Не выбрано'}
              </strong>
            </div>
          </div>

          {route && (
            <div className="route-result">
              <div>
                <span>Расстояние</span>
                <strong>{route.distance_km} км</strong>
              </div>
              <div>
                <span>Стоимость</span>
                <strong>{route.cost_rub} ₽</strong>
              </div>
            </div>
          )}

          {pageError && <div className="message error">{pageError}</div>}
          {isLoadingObjects && <div className="helper-text">Объекты обновляются...</div>}
        </section>

        <section className="panel panel-objects">
          <div className="panel-header">
            <h2>Объекты</h2>
            <button className="ghost-button" onClick={() => startCreate(form.objectType)}>
              Новый объект
            </button>
          </div>

          <div className="toolbar-grid">
            <label className="field">
              <span>Тип</span>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">Все</option>
                <option value="burt">Только бурты</option>
                <option value="receiving_point">Только точки приемки</option>
              </select>
            </label>

            <label className="field field-search">
              <span>Поиск</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Название, адрес, CRM ID"
              />
            </label>
          </div>

          <div className="object-list">
            {filteredObjects.map((object) => (
              <article
                key={objectKey(object)}
                className={`object-card ${selectedObjectIds.has(objectKey(object)) ? 'is-selected' : ''} ${
                  activeObject && objectKey(activeObject) === objectKey(object) ? 'is-active' : ''
                }`}
              >
                <button className="object-card-main" onClick={() => openObjectFromList(object)}>
                  <div className="object-card-top">
                    <span className={`object-badge type-${object.type}`}>{formatType(object.type)}</span>
                    <span className="object-id">#{object.id}</span>
                  </div>
                  <strong>{object.name}</strong>
                  <p>{object.address}</p>
                  <div className="object-meta">
                    <span>{object.crm_id || 'без CRM ID'}</span>
                    <span>
                      {object.lat?.toFixed(4)}, {object.lon?.toFixed(4)}
                    </span>
                  </div>
                </button>

                <div className="object-card-actions">
                  <button className="ghost-button" onClick={() => selectObjectForRoute(object)}>
                    Выбрать
                  </button>
                  <button className="ghost-button" onClick={() => startEdit(object)}>
                    Редактировать
                  </button>
                </div>
              </article>
            ))}

            {!filteredObjects.length && (
              <div className="empty-state">По текущему фильтру объекты не найдены.</div>
            )}
          </div>
        </section>

        <section className="panel panel-form">
          <div className="panel-header">
            <h2>{form.mode === 'edit' ? 'Редактирование объекта' : 'Создание объекта'}</h2>
            <button className="ghost-button" onClick={() => startCreate(form.objectType)}>
              Очистить
            </button>
          </div>

          <form className="editor-form" onSubmit={submitObject}>
            <div className="field-row">
              <label className="field">
                <span>Тип объекта</span>
                <select
                  value={form.objectType}
                  onChange={(e) => setFormField('objectType', e.target.value)}
                  disabled={form.mode === 'edit'}
                >
                  <option value="burt">Бурт</option>
                  <option value="receiving_point">Точка приемки</option>
                </select>
              </label>

              <label className="field">
                <span>CRM ID</span>
                <input
                  value={form.crmId}
                  onChange={(e) => setFormField('crmId', e.target.value)}
                  placeholder="burt_101"
                />
              </label>
            </div>

            <label className="field">
              <span>Название</span>
              <input
                value={form.name}
                onChange={(e) => setFormField('name', e.target.value)}
                placeholder="Например: Бурт Северный"
              />
            </label>

            <label className="field">
              <span>Адрес</span>
              <textarea
                value={form.address}
                onChange={(e) => setFormField('address', e.target.value)}
                rows={3}
                placeholder="Москва, Тверская улица, 1"
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Lat</span>
                <input
                  value={form.lat}
                  onChange={(e) => setFormField('lat', e.target.value)}
                  placeholder="55.7666517"
                />
              </label>

              <label className="field">
                <span>Lon</span>
                <input
                  value={form.lon}
                  onChange={(e) => setFormField('lon', e.target.value)}
                  placeholder="37.6028524"
                />
              </label>
            </div>

            {form.objectType === 'burt' ? (
              <>
                <div className="field-row">
                  <label className="field">
                    <span>Категория</span>
                    <input
                      value={form.category}
                      onChange={(e) => setFormField('category', e.target.value)}
                      placeholder="Пшеница"
                    />
                  </label>

                  <label className="field">
                    <span>Качество</span>
                    <input
                      value={form.quality}
                      onChange={(e) => setFormField('quality', e.target.value)}
                      placeholder="3 класс"
                    />
                  </label>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span>Объем</span>
                    <input
                      value={form.volume}
                      onChange={(e) => setFormField('volume', e.target.value)}
                      placeholder="1200"
                    />
                  </label>

                  <label className="field">
                    <span>Статус</span>
                    <input
                      value={form.status}
                      onChange={(e) => setFormField('status', e.target.value)}
                      placeholder="активен"
                    />
                  </label>
                </div>
              </>
            ) : (
              <label className="field">
                <span>Тип точки</span>
                <input
                  value={form.pointType}
                  onChange={(e) => setFormField('pointType', e.target.value)}
                  placeholder="элеватор"
                />
              </label>
            )}

            <div className="helper-text">
              Если координаты не заполнены, backend попробует определить их по адресу.
            </div>

            {formError && <div className="message error">{formError}</div>}
            {formSuccess && <div className="message success">{formSuccess}</div>}

            <div className="action-row">
              <button type="submit" disabled={isSubmittingObject}>
                {isSubmittingObject
                  ? form.mode === 'edit'
                    ? 'Сохраняем...'
                    : 'Создаем...'
                  : form.mode === 'edit'
                    ? 'Сохранить изменения'
                    : 'Создать объект'}
              </button>

              {form.mode === 'edit' && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={isDeletingObject}
                  onClick={() => void removeObject()}
                >
                  {isDeletingObject ? 'Удаляем...' : 'Удалить'}
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel panel-history">
          <div className="panel-header">
            <h2>История маршрутов</h2>
            {isLoadingHistory && <span className="helper-text">обновляем...</span>}
          </div>

          {historyError && <div className="message error">{historyError}</div>}

          <div className="history-list">
            {history.map((item) => {
              const canRepeat =
                item.from_object_type &&
                item.from_object_id &&
                item.to_object_type &&
                item.to_object_id

              return (
                <article key={item.id} className="history-card">
                  <div className="history-top">
                    <strong>Маршрут #{item.id}</strong>
                    <span>{formatDate(item.created_at)}</span>
                  </div>
                  <div className="history-line">
                    <b>Откуда:</b> {formatHistoryName(item, 'from')}
                  </div>
                  <div className="history-line">
                    <b>Куда:</b> {formatHistoryName(item, 'to')}
                  </div>
                  <div className="history-metrics">
                    <span>{item.distance_km} км</span>
                    <span>{item.cost} ₽</span>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => void repeatHistoryRoute(item)}
                    disabled={!canRepeat}
                  >
                    Повторить маршрут
                  </button>
                </article>
              )
            })}

            {!history.length && !isLoadingHistory && (
              <div className="empty-state">История маршрутов пока пуста.</div>
            )}
          </div>
        </section>
      </aside>

      <main className="map-area">
        <MapContainer
          center={[55.75, 37.61]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {!route && <FitToObjects objects={filteredObjects} />}
          {route?.geometry && <FitToRoute geometry={route.geometry} />}

          {filteredObjects.map((obj) => (
            <CircleMarker
              key={objectKey(obj)}
              center={[obj.lat, obj.lon]}
              radius={selectedObjectIds.has(objectKey(obj)) ? 13 : 9}
              pathOptions={{
                color: selectedObjectIds.has(objectKey(obj)) ? '#111827' : '#ffffff',
                weight: selectedObjectIds.has(objectKey(obj)) ? 3 : 2,
                fillColor: obj.type === 'burt' ? '#2563eb' : '#dc2626',
                fillOpacity: 0.95,
              }}
              eventHandlers={{
                click: () => {
                  setActiveObjectKey(objectKey(obj))
                  startEdit(obj)
                },
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>
                {obj.name}
              </Tooltip>

              <Popup>
                <div className="popup-card">
                  <strong>{obj.name}</strong>
                  <div>Тип: {formatType(obj.type)}</div>
                  <div>{obj.address}</div>
                  <div>lat: {obj.lat}</div>
                  <div>lon: {obj.lon}</div>
                  <div className="popup-actions">
                    <button onClick={() => selectObjectForRoute(obj)}>Выбрать</button>
                    <button className="ghost-button" onClick={() => startEdit(obj)}>
                      Редактировать
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {route?.geometry && (
            <Polyline
              positions={route.geometry.map(([lon, lat]) => [lat, lon])}
              pathOptions={{ color: '#2563eb', weight: 5 }}
            />
          )}
        </MapContainer>

        <div className="map-badge">© OpenStreetMap</div>
      </main>
    </div>
  )
}

export default App
