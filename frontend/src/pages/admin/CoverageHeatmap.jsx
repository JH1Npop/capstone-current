import { useEffect, useMemo, useState } from 'react';
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

function MapResizeController({ mapCenter, points }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (points.length > 1) {
        map.fitBounds(points, { padding: [28, 28], maxZoom: 12 });
      } else {
        map.setView(mapCenter, 11);
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
  const [stats, setStats] = useState({ totalPoints: 0, maxDensity: 0, totalTechnicians: 0 });
  const [error, setError] = useState('');
  const boundedHeatmapData = heatmapData.filter((point) => CALABARZON_BOUNDS.contains([point.lat, point.lng]));
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

  useEffect(() => {
    loadHeatmapData();
  }, [selectedClient, selectedTechnician, selectedServiceType]);

  const loadHeatmapData = async () => {
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

      setHeatmapData(heatmapResponse.heatmap_data || []);
      setTechnicianCoverage(coverageResponse.coverage_areas || []);
      setClientOptions(heatmapResponse.client_options || []);
      setTechnicianOptions(heatmapResponse.technician_options || coverageResponse.coverage_areas?.map((tech) => ({
        id: tech.technician_id,
        name: tech.name
      })) || []);
      setServiceOptions(heatmapResponse.service_options || []);
      setStats({
        totalPoints: heatmapResponse.total_points || 0,
        maxDensity: heatmapResponse.max_density || 0,
        totalTechnicians: coverageResponse.total_technicians || 0
      });
      setError('');
    } catch (error) {
      setHeatmapData([]);
      setTechnicianCoverage([]);
      setServiceOptions([]);
      setStats({ totalPoints: 0, maxDensity: 0, totalTechnicians: 0 });
      setError(error.message || 'Unable to load coverage heatmap.');
    }
    setLoading(false);
  };

  const resetFilters = () => {
    setSelectedClient('');
    setSelectedTechnician('');
    setSelectedServiceType('');
  };

  const getHeatmapColor = (count, maxDensity) => {
    if (!maxDensity) return '#64748b';
    const intensity = count / maxDensity;
    if (intensity > 0.8) return '#dc2626'; // Red for high density
    if (intensity > 0.6) return '#ea580c'; // Orange
    if (intensity > 0.4) return '#ca8a04'; // Yellow
    if (intensity > 0.2) return '#16a34a'; // Green
    return '#22c55e'; // Light green for low density
  };

  const getHeatmapRadius = (count) => {
    return Math.max(20, Math.min(50, count * 2)); // Scale radius based on count
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

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Service Areas</div>
          <div className="mt-1.5 text-3xl font-bold text-slate-800">{stats.totalPoints}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Highest Density</div>
          <div className="mt-1.5 text-3xl font-bold text-blue-600">{stats.maxDensity}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Active Technicians</div>
          <div className="mt-1.5 text-3xl font-bold text-emerald-600">{stats.totalTechnicians}</div>
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
            Showing {stats.totalPoints} completed jobs grouped into {boundedHeatmapData.length} mapped hotspot{boundedHeatmapData.length === 1 ? '' : 's'}.
          </p>
        </div>
        {loading ? (
          <div className="h-[min(68vh,720px)] min-h-[520px] p-4">
            <PanelSkeleton rows={10} />
          </div>
        ) : (
          <div className="h-[min(68vh,720px)] min-h-[520px]">
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
                    radius={getHeatmapRadius(point.count) * 10}
                    pathOptions={{
                      color: getHeatmapColor(point.count, stats.maxDensity),
                      fillColor: getHeatmapColor(point.count, stats.maxDensity),
                      fillOpacity: 0.55,
                      weight: 2
                    }}
                  >
                    <Popup>
                      <div className="min-w-[220px] text-left text-sm">
                        <strong>Service Hotspot</strong>
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
                      fillOpacity: 0.1,
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

        <div className="border-t border-slate-200 p-4">
          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-600"></div>
              <span>High density</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-600"></div>
              <span>Medium-high</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-600"></div>
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-600"></div>
              <span>Low</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-400"></div>
              <span>Very low</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-3 text-sm">
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
