import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'

const API = `http://${window.location.hostname}:8000`

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

function FitToRegion({ region, fallbackObjects }) {
  const map = useMap()

  useEffect(() => {
    if (region?.bbox) {
      map.fitBounds(region.bbox, { padding: [45, 45] })
      return
    }

    if (!fallbackObjects.length) return

    const bounds = fallbackObjects.map((obj) => [obj.lat, obj.lon])
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [fallbackObjects, map, region])

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

function FlyToLocation({ location }) {
  const map = useMap()

  useEffect(() => {
    if (!location) return

    map.flyTo([location.lat, location.lon], Math.max(map.getZoom(), 14), {
      animate: true,
      duration: 0.8,
    })
  }, [location, map])

  return null
}

function formatType(type) {
  if (type === 'burt') return 'Бурт'
  if (type === 'receiving_point') return 'Точка приемки'
  return type
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

function valuesForFilter(objects, fieldName) {
  return [...new Set(objects.map((obj) => obj[fieldName]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'ru'),
  )
}

function boundaryStyle(kind) {
  if (kind === 'region') {
    return {
      color: '#1f2937',
      weight: 2.2,
      fillOpacity: 0,
      opacity: 0.85,
    }
  }

  if (kind === 'region-selected') {
    return {
      color: '#1d4ed8',
      weight: 3,
      fillColor: '#93c5fd',
      fillOpacity: 0.08,
      opacity: 0.95,
    }
  }

  return {
    color: '#d97706',
    weight: 1.8,
    fillOpacity: 0,
    opacity: 0.9,
    dashArray: '6,6',
  }
}

function App() {
  const [objects, setObjects] = useState([])
  const [route, setRoute] = useState(null)
  const [regionsData, setRegionsData] = useState({ regions: [], object_regions: [] })

  const [pageError, setPageError] = useState('')
  const [regionError, setRegionError] = useState('')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const [isLoadingObjects, setIsLoadingObjects] = useState(false)
  const [isLoadingRegions, setIsLoadingRegions] = useState(false)
  const [isBuildingRoute, setIsBuildingRoute] = useState(false)
  const [isFindingOptimalRoute, setIsFindingOptimalRoute] = useState(false)
  const [isSubmittingObject, setIsSubmittingObject] = useState(false)
  const [isDeletingObject, setIsDeletingObject] = useState(false)

  const [filterType, setFilterType] = useState('all')
  const [filterRegion, setFilterRegion] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [optimizationMode, setOptimizationMode] = useState('balanced')
  const [burtCategoryFilter, setBurtCategoryFilter] = useState('all')
  const [burtQualityFilter, setBurtQualityFilter] = useState('all')
  const [burtVolumeFilter, setBurtVolumeFilter] = useState('all')
  const [burtStatusFilter, setBurtStatusFilter] = useState('all')
  const [receivingPointTypeFilter, setReceivingPointTypeFilter] = useState('all')
  const [fromObject, setFromObject] = useState(null)
  const [toObject, setToObject] = useState(null)
  const [activeObjectKey, setActiveObjectKey] = useState(null)
  const [routeExplanation, setRouteExplanation] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [isLocatingUser, setIsLocatingUser] = useState(false)

  useEffect(() => {
    if (filterType !== 'burt') {
      setBurtCategoryFilter('all')
      setBurtQualityFilter('all')
      setBurtVolumeFilter('all')
      setBurtStatusFilter('all')
    }
    if (filterType !== 'receiving_point') {
      setReceivingPointTypeFilter('all')
    }
  }, [filterType])

  const validObjects = useMemo(() => {
    return objects.filter((obj) => obj.lat !== null && obj.lon !== null)
  }, [objects])

  const objectRegionsMap = useMemo(() => {
    const map = new Map()
    for (const row of regionsData.object_regions || []) {
      map.set(`${row.object_type}-${row.object_id}`, row)
    }
    return map
  }, [regionsData.object_regions])

  const selectedRegion = useMemo(() => {
    return (regionsData.regions || []).find((region) => region.key === filterRegion) || null
  }, [filterRegion, regionsData.regions])

  const objectsInRegionScope = useMemo(() => {
    if (filterRegion === 'all') return validObjects

    return validObjects.filter((obj) => {
      const admin = objectRegionsMap.get(objectKey(obj))
      return admin?.region_key === filterRegion
    })
  }, [filterRegion, objectRegionsMap, validObjects])

  const burtCategoryOptions = useMemo(() => {
    return valuesForFilter(objectsInRegionScope.filter((obj) => obj.type === 'burt'), 'category')
  }, [objectsInRegionScope])

  const burtStatusOptions = useMemo(() => {
    return valuesForFilter(objectsInRegionScope.filter((obj) => obj.type === 'burt'), 'status')
  }, [objectsInRegionScope])

  const burtQualityOptions = useMemo(() => {
    return valuesForFilter(objectsInRegionScope.filter((obj) => obj.type === 'burt'), 'quality')
  }, [objectsInRegionScope])

  const burtVolumeOptions = useMemo(() => {
    return valuesForFilter(objectsInRegionScope.filter((obj) => obj.type === 'burt'), 'volume')
  }, [objectsInRegionScope])

  const receivingPointTypeOptions = useMemo(() => {
    return valuesForFilter(
      objectsInRegionScope.filter((obj) => obj.type === 'receiving_point'),
      'point_type',
    )
  }, [objectsInRegionScope])

  const filteredObjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return objectsInRegionScope.filter((obj) => {
      const typeMatch = filterType === 'all' || obj.type === filterType
      if (!typeMatch) return false

      const queryMatch = objectMatchesQuery(obj, normalizedQuery)
      if (!queryMatch) return false

      if (obj.type === 'burt') {
        const categoryMatch =
          burtCategoryFilter === 'all' || (obj.category || '') === burtCategoryFilter
        const qualityMatch =
          burtQualityFilter === 'all' || (obj.quality || '') === burtQualityFilter
        const volumeMatch =
          burtVolumeFilter === 'all' || String(obj.volume ?? '') === burtVolumeFilter
        const statusMatch = burtStatusFilter === 'all' || (obj.status || '') === burtStatusFilter
        return categoryMatch && qualityMatch && volumeMatch && statusMatch
      }

      if (obj.type === 'receiving_point') {
        const pointTypeMatch =
          receivingPointTypeFilter === 'all' ||
          (obj.point_type || '') === receivingPointTypeFilter
        return pointTypeMatch
      }

      return true
    })
  }, [
    burtCategoryFilter,
    burtQualityFilter,
    burtVolumeFilter,
    burtStatusFilter,
    filterType,
    objectsInRegionScope,
    receivingPointTypeFilter,
    searchQuery,
  ])

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

  async function loadRegions() {
    setIsLoadingRegions(true)
    setRegionError('')

    try {
      const res = await axios.get(`${API}/map/regions`)
      setRegionsData({
        regions: res.data?.regions || [],
        object_regions: res.data?.object_regions || [],
      })
    } catch (err) {
      console.error(err)
      setRegionError('Не удалось загрузить регионы и границы')
    } finally {
      setIsLoadingRegions(false)
    }
  }

  async function refreshData() {
    await Promise.all([loadObjects(), loadRegions()])
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
    setRouteExplanation([])
    setPageError('')
  }

  function applyCurrentLocationToForm() {
    if (!currentLocation) return

    setForm((current) => ({
      ...current,
      lat: currentLocation.lat.toFixed(6),
      lon: currentLocation.lon.toFixed(6),
    }))
    setFormSuccess('Текущие координаты подставлены в форму')
    setFormError('')
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationError('Геолокация не поддерживается этим браузером')
      return
    }

    setIsLocatingUser(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }

        setCurrentLocation(nextLocation)
        setFormError('')
        setFormSuccess('')
        setIsLocatingUser(false)
      },
      (error) => {
        let message = 'Не удалось определить местоположение'

        if (error.code === error.PERMISSION_DENIED) {
          message = 'Доступ к геолокации запрещен. Разрешите его в браузере.'
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Координаты сейчас недоступны'
        } else if (error.code === error.TIMEOUT) {
          message = 'Время ожидания геолокации истекло'
        }

        setLocationError(message)
        setIsLocatingUser(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    )
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
      setRouteExplanation([])
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

      await refreshData()
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
      const message = err.response?.data?.detail || 'Не удалось сохранить объект'
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

  function openObjectFromList(object) {
    setActiveObjectKey(objectKey(object))
    startEdit(object)
  }

  async function findOptimalRoute() {
    const sourceObject = fromObject || activeObject

    if (!sourceObject) {
      setPageError('Сначала выберите исходный объект')
      return
    }

    setIsFindingOptimalRoute(true)
    setPageError('')

    try {
      const res = await axios.post(`${API}/route/optimal/by-object`, {
        from_object_type: sourceObject.type,
        from_object_id: sourceObject.id,
        optimization_mode: optimizationMode,
        rate_rub_per_km: 50,
        fixed_costs: 0,
        alternatives_limit: 3,
      })

      const bestTarget =
        validObjects.find(
          (obj) =>
            obj.type === res.data.to_object_type &&
            obj.id === res.data.to_object_id,
        ) || null

      setFromObject(sourceObject)
      setToObject(bestTarget)
      setActiveObjectKey(objectKey(sourceObject))
      setRoute(res.data)
      setRouteExplanation(res.data.explanation || [])
    } catch (err) {
      console.error(err)
      const message =
        err.response?.data?.detail || 'Не удалось подобрать оптимальный маршрут'
      setPageError(String(message))
    } finally {
      setIsFindingOptimalRoute(false)
    }
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
          </div>

          <div className="selection-card">
            <div>
              <span>GPS</span>
              <strong>
                {currentLocation
                  ? `${currentLocation.lat.toFixed(6)}, ${currentLocation.lon.toFixed(6)}`
                  : 'Местоположение не определено'}
              </strong>
            </div>
            {currentLocation?.accuracy ? (
              <div className="helper-text">
                Точность: примерно {Math.round(currentLocation.accuracy)} м
              </div>
            ) : null}
            <div className="action-row">
              <button onClick={locateUser} disabled={isLocatingUser}>
                {isLocatingUser ? 'Определяем...' : 'Показать моё местоположение'}
              </button>
              <button
                className="ghost-button"
                onClick={applyCurrentLocationToForm}
                disabled={!currentLocation}
              >
                Подставить в форму
              </button>
            </div>
            {locationError && <div className="message error">{locationError}</div>}
          </div>

          <label className="field">
            <span>Режим подбора</span>
            <select
              value={optimizationMode}
              onChange={(e) => setOptimizationMode(e.target.value)}
            >
              <option value="balanced">Сбалансированный</option>
              <option value="nearest">Ближайший</option>
              <option value="cheapest">Самый дешевый</option>
            </select>
          </label>

          <div className="action-row">
            <button onClick={() => void buildRouteBetween(fromObject, toObject)} disabled={isBuildingRoute}>
              {isBuildingRoute ? 'Строим маршрут...' : 'Построить'}
            </button>
            <button
              className="ghost-button"
              onClick={() => void findOptimalRoute()}
              disabled={isFindingOptimalRoute}
            >
              {isFindingOptimalRoute ? 'Подбираем...' : 'Подобрать оптимальный'}
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

          {!!routeExplanation.length && (
            <div className="selection-card">
              <div>
                <span>Почему выбран маршрут</span>
                <strong>{routeExplanation[0]}</strong>
              </div>
              {routeExplanation.slice(1).map((item) => (
                <div key={item} className="helper-text">
                  {item}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel panel-objects">
          <div className="panel-header">
            <h2>Объекты</h2>
            <button className="ghost-button" onClick={() => startCreate(form.objectType)}>
              Новый объект
            </button>
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
      </aside>

      <main className="map-area">
        <section className="panel panel-filters panel-filters-floating">
          <div className="panel-header">
            <h2>Фильтры</h2>
            <button className="ghost-button" onClick={() => void refreshData()}>
              Обновить
            </button>
          </div>

          <div className="toolbar-grid toolbar-grid-floating">
            <label className="field field-search">
              <span>Поиск</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Название, адрес, CRM ID"
              />
            </label>

            <label className="field">
              <span>Тип объектов</span>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">Все</option>
                <option value="burt">Бурты</option>
                <option value="receiving_point">Точки приемки</option>
              </select>
            </label>

            <label className="field">
              <span>Регион</span>
              <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
                <option value="all">Все регионы</option>
                {(regionsData.regions || []).map((region) => (
                  <option key={region.key} value={region.key}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filterType === 'burt' && (
            <div className="toolbar-grid toolbar-grid-floating">
              <label className="field">
                <span>Категория</span>
                <select
                  value={burtCategoryFilter}
                  onChange={(e) => setBurtCategoryFilter(e.target.value)}
                >
                  <option value="all">Все</option>
                  {burtCategoryOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Качество</span>
                <select
                  value={burtQualityFilter}
                  onChange={(e) => setBurtQualityFilter(e.target.value)}
                >
                  <option value="all">Все</option>
                  {burtQualityOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Объем</span>
                <select
                  value={burtVolumeFilter}
                  onChange={(e) => setBurtVolumeFilter(e.target.value)}
                >
                  <option value="all">Все</option>
                  {burtVolumeOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Статус</span>
                <select
                  value={burtStatusFilter}
                  onChange={(e) => setBurtStatusFilter(e.target.value)}
                >
                  <option value="all">Все</option>
                  {burtStatusOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {filterType === 'receiving_point' && (
            <div className="toolbar-grid toolbar-grid-floating">
              <label className="field">
                <span>Тип точки</span>
                <select
                  value={receivingPointTypeFilter}
                  onChange={(e) => setReceivingPointTypeFilter(e.target.value)}
                >
                  <option value="all">Все</option>
                  {receivingPointTypeOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="helper-text">
            {filterRegion === 'all'
              ? 'Показываются только границы регионов.'
              : 'Карта центрирована на выбранном регионе, показаны границы региона и районов.'}
          </div>

          {isLoadingRegions && <div className="helper-text">Границы обновляются...</div>}
          {regionError && <div className="message error">{regionError}</div>}
          {pageError && <div className="message error">{pageError}</div>}
          {isLoadingObjects && <div className="helper-text">Объекты обновляются...</div>}
        </section>

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

          <FlyToLocation location={currentLocation} />

          {filterRegion === 'all' &&
            (regionsData.regions || []).map(
              (region) =>
                region.boundary && (
                  <GeoJSON
                    key={`region-${region.key}`}
                    data={region.boundary}
                    pathOptions={boundaryStyle('region')}
                  />
                ),
            )}

          {filterRegion !== 'all' && selectedRegion?.boundary && (
            <GeoJSON
              key={`region-selected-${selectedRegion.key}`}
              data={selectedRegion.boundary}
              pathOptions={boundaryStyle('region-selected')}
            />
          )}

          {filterRegion !== 'all' &&
            (selectedRegion?.districts || []).map(
              (district) =>
                district.boundary && (
                  <GeoJSON
                    key={`district-${district.key}`}
                    data={district.boundary}
                    pathOptions={boundaryStyle('district')}
                  />
                ),
            )}

          {!route && filterRegion === 'all' && <FitToObjects objects={filteredObjects} />}
          {!route && filterRegion !== 'all' && (
            <FitToRegion region={selectedRegion} fallbackObjects={filteredObjects} />
          )}
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

          {currentLocation && (
            <CircleMarker
              center={[currentLocation.lat, currentLocation.lon]}
              radius={12}
              pathOptions={{
                color: '#14532d',
                weight: 3,
                fillColor: '#22c55e',
                fillOpacity: 0.95,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                Вы здесь
              </Tooltip>

              <Popup>
                <div className="popup-card">
                  <strong>Ваше местоположение</strong>
                  <div>lat: {currentLocation.lat.toFixed(6)}</div>
                  <div>lon: {currentLocation.lon.toFixed(6)}</div>
                  {currentLocation.accuracy ? (
                    <div>Точность: примерно {Math.round(currentLocation.accuracy)} м</div>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          )}
        </MapContainer>

        <div className="map-badge">© OpenStreetMap</div>
      </main>
    </div>
  )
}

export default App
