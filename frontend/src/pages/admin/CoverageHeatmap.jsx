import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { MapContainer, Circle, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMap } from 'react-icons/fi';
import { fetchCoverageHeatmap, fetchTechnicianCoverage } from '../../api/api';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM
} from '../../utils/mapRegion';
import MapTileLayer from '../../components/maps/MapTileLayer';
import SearchFilterBar from '../../components/shared/SearchFilterBar';

const TECH_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#ea580c', '#be123c', '#0891b2'];
const DENSITY_GRADIENT = 'linear-gradient(90deg, #22c55e 0%, #16a34a 25%, #eab308 50%, #f97316 75%, #dc2626 100%)';
const GEOGRAPHIC_LEVELS = {
  hotspot: { option: 'Hotspot areas', singular: 'hotspot', plural: 'hotspots' },
  barangay: { option: 'Barangay', singular: 'barangay', plural: 'barangays' },
  city: { option: 'City / municipality', singular: 'city / municipality', plural: 'cities / municipalities' },
  province: { option: 'Province', singular: 'province', plural: 'provinces' },
};

function MapResizeController({ mapCenter, points }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.stop();
      map.invalidateSize({ animate: false });

      if (points.length > 1) {
        map.fitBounds(points, { padding: [28, 28], maxZoom: 12, animate: false });
      } else {
        map.setView(mapCenter, 11, { animate: false });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [map, mapCenter, points]);

  return null;
}

const getServiceBreakdown = (point) => {
  if (Array.isArray(point?.service_breakdown) && point.service_breakdown.length > 0) {
    return point.service_breakdown;
  }

  return Array.isArray(point?.service_types)
    ? point.service_types.map((name) => ({ name, count: 1 }))
    : [];
};

export default function CoverageHeatmap() {
  const [heatmapData, setHeatmapData] = useState([]);
  const [geographicLevels, setGeographicLevels] = useState({ barangay: [], city: [], province: [] });
  const [geographicLevel, setGeographicLevel] = useState('hotspot');
  const [technicianCoverage, setTechnicianCoverage] = useState([]);
  const [clientOptions, setClientOptions] = useState([]);
  const [technicianOptions, setTechnicianOptions] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [showServiceDensity, setShowServiceDensity] = useState(true);
  const [showTechnicianCoverage, setShowTechnicianCoverage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalPoints: 0, totalJobs: 0, maxDensity: 0, totalTechnicians: 0 });
  // Only the newest request may update the page when filters change quickly.
  const requestSequence = useRef(0);
  const [error, setError] = useState('');
  const geographicConfig = GEOGRAPHIC_LEVELS[geographicLevel];
  const selectedGeographicData = geographicLevel === 'hotspot'
    ? heatmapData
    : geographicLevels[geographicLevel] || [];
  const boundedHeatmapData = selectedGeographicData.filter((point) => CALABARZON_BOUNDS.contains([point.lat, point.lng]));
  const displayedMaxDensity = Math.max(0, ...boundedHeatmapData.map((point) => Number(point.count || 0)));
  const boundedTechnicianCoverage = technicianCoverage.filter((tech) => CALABARZON_BOUNDS.contains(tech.center));
  const mapPoints = useMemo(
    () => [
      ...boundedHeatmapData.map((point) => [point.lat, point.lng]),
      ...boundedTechnicianCoverage.map((tech) => tech.center)
    ],
    [boundedHeatmapData, boundedTechnicianCoverage]
  );
  const mapCenter = boundedHeatmapData.length > 0
    ? [boundedHeatmapData[0].lat, boundedHeatmapData[0].lng]
    : boundedTechnicianCoverage.length > 0
      ? boundedTechnicianCoverage[0].center
      : CALABARZON_CENTER;
  const serviceSummary = useMemo(() => {
    const totals = {};

    boundedHeatmapData.forEach((point) => {
      getServiceBreakdown(point).forEach((service) => {
        totals[service.name] = (totals[service.name] || 0) + Number(service.count || 0);
      });
    });

    return Object.entries(totals)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [boundedHeatmapData]);

  // The same hotspot details as the map popups, in a list keyboard and screen-reader users can read.
  const HOTSPOT_LIST_LIMIT = 10;
  const rankedHotspots = useMemo(
    () => [...boundedHeatmapData].sort((a, b) => b.count - a.count || String(a.address || '').localeCompare(String(b.address || ''))),
    [boundedHeatmapData]
  );

  useEffect(() => {
    loadHeatmapData();
  }, [selectedClient, selectedTechnician, selectedServiceType]);

  const loadHeatmapData = async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    try {
      const filters = {
        client: selectedClient,
        technician: selectedTechnician,
        serviceType: selectedServiceType
      };
      const [heatmapResponse, coverageResponse] = await Promise.all([
        fetchCoverageHeatmap(filters),
        fetchTechnicianCoverage(filters)
      ]);
      if (requestId !== requestSequence.current) return;

      setHeatmapData(heatmapResponse.heatmap_data || []);
      setGeographicLevels(heatmapResponse.geographic_levels || { barangay: [], city: [], province: [] });
      setTechnicianCoverage(coverageResponse.coverage_areas || []);
      setClientOptions(heatmapResponse.client_options || []);
      setTechnicianOptions(heatmapResponse.technician_options || coverageResponse.coverage_areas?.map((tech) => ({
        id: tech.technician_id,
        name: tech.name
      })) || []);
      setServiceOptions(heatmapResponse.service_options || []);
      setStats({
        totalPoints: heatmapResponse.total_points || 0,
        totalJobs: heatmapResponse.total_jobs ?? (heatmapResponse.heatmap_data || []).reduce((sum, point) => sum + Number(point.count || 0), 0),
        maxDensity: heatmapResponse.max_density || 0,
        totalTechnicians: coverageResponse.total_technicians || 0
      });
      setError('');
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setHeatmapData([]);
      setGeographicLevels({ barangay: [], city: [], province: [] });
      setTechnicianCoverage([]);
      setServiceOptions([]);
      setStats({ totalPoints: 0, totalJobs: 0, maxDensity: 0, totalTechnicians: 0 });
      setError(error.message || 'Unable to load coverage heatmap.');
    }
    if (requestId === requestSequence.current) setLoading(false);
  };

  const resetFilters = () => {
    setSelectedClient('');
    setSelectedTechnician('');
    setSelectedServiceType('');
  };

  const getHeatmapColor = (count, maxDensity) => {
    if (!maxDensity) return '#64748b';
    const intensity = count / maxDensity;
    if (intensity > 0.8) return '#dc2626';
    if (intensity > 0.6) return '#f97316';
    if (intensity > 0.4) return '#eab308';
    if (intensity > 0.2) return '#16a34a';
    return '#22c55e';
  };

  const getHeatmapRadius = (count, maxDensity) => {
    if (!maxDensity) return 180;
    const intensity = Math.max(0, Math.min(1, count / maxDensity));
    // Area, rather than diameter, grows with volume so busy points do not dominate the map.
    return Math.round(180 + Math.sqrt(intensity) * 320);
  };

  const getTechnicianColor = (technicianId, index) => {
    const numericId = Number(technicianId);
    const colorIndex = Number.isFinite(numericId) ? numericId % TECH_COLORS.length : index % TECH_COLORS.length;
    return TECH_COLORS[colorIndex];
  };

  return (
    <Layout>
      {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <SearchFilterBar
        className="mb-4"
        filters={[
          { key: 'client', label: 'Client locations', value: selectedClient, defaultValue: '', onChange: setSelectedClient, options: [{ value: '', label: 'All client locations' }, ...clientOptions.map((client) => ({ value: String(client.id), label: client.name }))] },
          { key: 'technician', label: 'Technician coverage', value: selectedTechnician, defaultValue: '', onChange: setSelectedTechnician, options: [{ value: '', label: 'All technicians' }, ...technicianOptions.map((technician) => ({ value: String(technician.id), label: technician.name }))] },
          { key: 'service', label: 'Service density', value: selectedServiceType, defaultValue: '', onChange: setSelectedServiceType, options: [{ value: '', label: 'All services' }, ...serviceOptions.map((service) => ({ value: String(service.id), label: service.name }))] },
        ]}
        onClear={resetFilters}
        toolbarContent={(
          <>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <span className="text-xs font-semibold text-slate-500">View by</span>
              <select
                aria-label="Geographic level"
                value={geographicLevel}
                onChange={(event) => setGeographicLevel(event.target.value)}
                className="min-w-0 bg-transparent text-sm font-semibold text-slate-800 outline-none"
              >
                {Object.entries(GEOGRAPHIC_LEVELS).map(([value, config]) => (
                  <option key={value} value={value}>{config.option}</option>
                ))}
              </select>
            </label>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</span>
            <button
              type="button"
              aria-pressed={showServiceDensity}
              onClick={() => setShowServiceDensity((current) => !current)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${showServiceDensity ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <span className={`h-2 w-2 rounded-full ${showServiceDensity ? 'bg-brand-500' : 'bg-slate-300'}`} />
              Service density
            </button>
            <button
              type="button"
              aria-pressed={showTechnicianCoverage}
              onClick={() => setShowTechnicianCoverage((current) => !current)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${showTechnicianCoverage ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <span className={`h-2 w-2 rounded-full ${showTechnicianCoverage ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              Technician coverage
            </button>
          </>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Completed jobs</div>
          <div className="mt-1.5 text-3xl font-bold text-slate-800">{stats.totalJobs}</div>
          <div className="mt-1 text-xs text-slate-400">With a mapped service location</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">{geographicLevel === 'hotspot' ? 'Hotspots' : `Mapped ${geographicConfig.plural}`}</div>
          <div className="mt-1.5 text-3xl font-bold text-slate-800">{boundedHeatmapData.length}</div>
          <div className="mt-1 text-xs text-slate-400">{geographicLevel === 'hotspot' ? 'Areas about 1 km across' : `Grouped by saved ${geographicConfig.singular}`}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Busiest {geographicConfig.singular}</div>
          <div className="mt-1.5 text-3xl font-bold text-blue-600">{displayedMaxDensity}</div>
          <div className="mt-1 text-xs text-slate-400">Completed jobs in one mapped group</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Technicians with a location</div>
          <div className="mt-1.5 text-3xl font-bold text-emerald-600">{stats.totalTechnicians}</div>
          <div className="mt-1 text-xs text-slate-400">Shown as 10 km coverage circles</div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">Service Mix</div>
        {serviceSummary.length ? (
          <div className="flex flex-wrap gap-2">
            {serviceSummary.map((service) => (
              <span
                key={service.name}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                {service.name}: {service.count}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No completed service locations are available for the selected filters.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FiMap className="text-sky-500" />
            Coverage Map
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Showing {stats.totalJobs} completed job{stats.totalJobs === 1 ? '' : 's'} grouped into {boundedHeatmapData.length} mapped {boundedHeatmapData.length === 1 ? geographicConfig.singular : geographicConfig.plural}.
          </p>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
          {loading ? (
            <div className="h-[min(68vh,720px)] min-h-[520px] p-4 lg:col-span-2">
            <PanelSkeleton rows={10} />
          </div>
        ) : (
          <div className={`relative h-[min(68vh,720px)] min-h-[520px] ${rankedHotspots.length ? '' : 'lg:col-span-2'}`}>
            {!showServiceDensity && !showTechnicianCoverage && (
              <div role="status" className="pointer-events-none absolute inset-x-0 top-4 z-[500] mx-auto w-fit rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow">
                Both layers are hidden. Turn on Service density or Technician coverage.
              </div>
            )}
            {showServiceDensity && (
              <div role="img" aria-label="Service density scale, lower to higher jobs per area" className="pointer-events-none absolute bottom-4 left-4 z-[500] w-48 rounded-xl border border-white/80 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800">
                  <span>Service density</span>
                  <span className="font-normal text-slate-500">jobs per area</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full" style={{ background: DENSITY_GRADIENT }} />
                <div className="mt-1 flex justify-between text-[11px] text-slate-600">
                  <span>Lower</span>
                  <span>Higher</span>
                </div>
              </div>
            )}
            <MapContainer
              center={mapCenter}
              zoom={11}
              minZoom={CALABARZON_MIN_ZOOM}
              maxBounds={CALABARZON_BOUNDS}
              maxBoundsViscosity={1.0}
              className="h-full w-full"
            >
              <MapResizeController mapCenter={mapCenter} points={mapPoints} />
              <MapTileLayer />

              {showServiceDensity && boundedHeatmapData.map((point, index) => {
                const serviceBreakdown = getServiceBreakdown(point);

                return (
                  <Circle
                    key={`heatmap-${index}`}
                    center={[point.lat, point.lng]}
                    radius={getHeatmapRadius(point.count, displayedMaxDensity)}
                    pathOptions={{
                      color: getHeatmapColor(point.count, displayedMaxDensity),
                      fillColor: getHeatmapColor(point.count, displayedMaxDensity),
                      fillOpacity: 0.5,
                      weight: 2
                    }}
                  >
                    <Popup>
                      <div className="min-w-[220px] text-left text-sm">
                        <strong>{geographicLevel === 'hotspot' ? 'Service hotspot' : geographicConfig.option}</strong>
                        <div className="mt-1 text-slate-700">{point.address || 'Mapped service area'}</div>
                        <div className="mt-2 font-semibold text-slate-900">
                          {point.count} completed service{point.count === 1 ? '' : 's'}
                        </div>
                        <div className="mt-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services Completed Here</div>
                          <ul className="mt-1 space-y-1">
                            {serviceBreakdown.map((service) => (
                              <li key={service.name} className="flex items-center justify-between gap-3">
                                <span>{service.name}</span>
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                  {service.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {Array.isArray(point.status_breakdown) && point.status_breakdown.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Mix</div>
                            <ul className="mt-1 space-y-1">
                              {point.status_breakdown.map((statusItem) => (
                                <li key={statusItem.name} className="flex items-center justify-between gap-3">
                                  <span>{statusItem.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {statusItem.count}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">
                          Clients: {(point.clients || []).map((client) => client.name).join(', ') || 'n/a'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Technicians: {(point.technicians || []).map((tech) => tech.name).join(', ') || 'n/a'}
                        </div>
                      </div>
                    </Popup>
                  </Circle>
                );
              })}

              {showTechnicianCoverage && boundedTechnicianCoverage.map((tech, index) => {
                const color = getTechnicianColor(tech.technician_id, index);
                return (
                  <Circle
                    key={`coverage-${index}`}
                    center={tech.center}
                    radius={tech.radius_km * 1000}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.08,
                      weight: 2,
                      dashArray: '5, 5'
                    }}
                  >
                    <Popup>
                      <div className="text-center">
                        <strong>{tech.name}</strong><br />
                        Coverage Area: {tech.radius_km} km radius
                      </div>
                    </Popup>
                  </Circle>
                );
              })}
            </MapContainer>
          </div>
        )}

        {!loading && rankedHotspots.length > 0 && (
          <section aria-labelledby="busiest-hotspots-heading" className="border-t border-slate-200 bg-slate-50/60 p-4 lg:max-h-[min(68vh,720px)] lg:min-h-[520px] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <h3 id="busiest-hotspots-heading" className="text-sm font-semibold text-slate-900">Busiest {geographicConfig.plural}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Showing {Math.min(HOTSPOT_LIST_LIMIT, rankedHotspots.length)} of {rankedHotspots.length}, most completed jobs first.
            </p>
            <ol className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rankedHotspots.slice(0, HOTSPOT_LIST_LIMIT).map((point) => (
                <li key={`${point.lat},${point.lng}`} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1.6fr)] sm:items-center lg:grid-cols-1">
                  <span className="min-w-0 truncate font-medium text-slate-900" title={point.address || ''}>{point.address || 'Mapped service area'}</span>
                  <span className="font-semibold text-blue-700">{point.count} job{point.count === 1 ? '' : 's'}</span>
                  <span className="min-w-0 truncate text-xs text-slate-500">
                    {getServiceBreakdown(point).map((service) => `${service.name} (${service.count})`).join(', ')}
                    {(point.technicians || []).length ? ` · ${(point.technicians || []).map((tech) => tech.name).join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {boundedTechnicianCoverage.length ? boundedTechnicianCoverage.map((tech, index) => {
              const color = getTechnicianColor(tech.technician_id, index);
              return (
                <div key={tech.technician_id} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-dashed"
                    style={{ borderColor: color, backgroundColor: `${color}22` }}
                  ></div>
                  <span>{tech.name} coverage</span>
                </div>
              );
            }) : (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-dashed border-blue-500 bg-blue-50"></div>
                <span>Technician Coverage Areas</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
