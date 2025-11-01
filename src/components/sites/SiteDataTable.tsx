import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Site, ProviderType } from '@/types/database';
import { Upload } from 'lucide-react';

interface SiteDataTableProps {
  sites: any[];
  loading: boolean;
  provider: ProviderType;
  onSitesUpdate: () => void;
}

// Lightweight CSV/TSV -> objects parser (handles quoted cells simply)
function csvToObjects(csvText: string) {
  // Normalize line endings and trim leading/trailing whitespace
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];

  // Guess delimiter: tab if tabs present, else comma
  const delim = text.indexOf('\t') >= 0 ? '\t' : ',';

  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];

  const parseLine = (line: string) => {
    const parts: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // escaped quote
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && ch === delim) {
        parts.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    parts.push(cur);
    return parts.map((p) => p.trim());
  };

  const headers = parseLine(lines[0]).map((h) => String(h).trim());
  const rows = lines.slice(1).map((ln) => {
    const values = parseLine(ln);
    const obj: any = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = values[i] ?? '';
    }
    return obj;
  });
  return rows;
}

// sanitize small key parts for fallback keys
const sanitizeKeyPart = (s?: string) =>
  String(s ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9\-_.]/g, '')
    .slice(0, 80);

export const SiteDataTable: React.FC<SiteDataTableProps> = ({
  sites,
  loading,
  provider,
  onSitesUpdate,
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Normalize incoming JSON rows to a predictable shape
  const normalizeSite = (item: any, index: number) => ({
    site_id:
      item.site_id || item['SITE ID'] || item['Site A'] || item['site_id'] || `imported_${Date.now()}_${index}`,
    site_name: item.site_name || item['Site A'] || item['SITE ID'] || item['site_name'] || 'Unknown Site',
    city: item.city || item['CITY'] || item.City || item['city'] || 'Unknown City',
    state: item.state || item['STATE'] || item.State || item['state'] || 'Unknown State',
    address: item.address || item['SITE ADDRESS'] || item.Address || item['address'] || 'Unknown Address',
    latitude: item.latitude || item['LATITUDE'] || item.Latitude || item['latitude'] || null,
    longitude: item.longitude || item['LONGITUDE'] || item.Longitude || item['longitude'] || null,
    // common MTN fields
    list_of_segment:
      item.list_of_segment || item['List of Segment'] || item['LIST_OF_SEGMENT'] || item.segment || item['segment'] || null,
    network_type: item.network_type || item['Network Type'] || item['NETWORK_TYPE'] || null,
    distance_km: item.distance_km ?? item['Distance Km'] ?? item['Distance_Km'] ?? item.distance ?? null,
    // preserve original object
    original: item,
  });

  function processSites(sitesData: any[]) {
    return sitesData.map((item, index) => normalizeSite(item, index));
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const filename = file.name.toLowerCase();
    const isJson = filename.endsWith('.json');
    const isCsv = filename.endsWith('.csv') || filename.endsWith('.tsv') || filename.endsWith('.txt');

    if (!isJson && !isCsv) {
      toast({ title: 'Error', description: 'Please upload a JSON or CSV/TSV file', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      let parsed: any[] = [];

      if (isJson) {
        const jsonData = JSON.parse(text);
        parsed = Array.isArray(jsonData) ? jsonData : [jsonData];
      } else {
        // CSV/TSV -> objects
        parsed = csvToObjects(text);
      }

      const normalized = processSites(parsed);

      let dbError: any = null;
      let importedCount = 0;

      if (provider === 'mtn') {
        const mtnRows = normalized.map((item: any, index: number) => ({
          list_of_segment: (item.list_of_segment || `imported_${Date.now()}_${index}`).toString().trim(),
          network_type: item.network_type || 'Unknown',
          state: item.state || 'Unknown',
          distance_km:
            item.distance_km !== null && item.distance_km !== undefined
              ? parseFloat(String(item.distance_km))
              : null,
          site_id: item.site_id,
          site_name: item.site_name,
          city: item.city,
          address: item.address,
          latitude: item.latitude,
          longitude: item.longitude,
          original: item.original ?? item,
        }));

        const { error } = await supabase.from('mtn_sites').upsert(mtnRows, { onConflict: 'list_of_segment' });
        dbError = error;
        importedCount = mtnRows.length;
      } else {
        const genericRows = normalized.map((item: any) => ({
          site_id: item.site_id,
          site_name: item.site_name,
          city: item.city,
          state: item.state,
          address: item.address,
          latitude: item.latitude,
          longitude: item.longitude,
          original: item.original ?? item,
        }));

        if (provider === 'airtel') {
          const { error } = await supabase.from('airtel_sites').upsert(genericRows, { onConflict: 'site_id' });
          dbError = error;
          importedCount = genericRows.length;
        } else if (provider === 'glo') {
          const { error } = await supabase.from('glo_sites').upsert(genericRows, { onConflict: 'site_id' });
          dbError = error;
          importedCount = genericRows.length;
        }
      }

      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }

      toast({ title: 'Success', description: `Imported ${importedCount} ${provider.toUpperCase()} rows` });
      onSitesUpdate();
    } catch (err: any) {
      console.error('Error uploading sites:', err);
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to upload sites data', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <CardTitle>
            {provider.toUpperCase()} Sites ({sites.length})
          </CardTitle>

          {profile?.role === 'fibre_network' && (
            <div>
              <input ref={fileInputRef} type="file" accept=".json,.csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Importing...' : 'Import file'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {provider === 'airtel' && (
                  <>
                    <TableHead>site_name</TableHead>
                    <TableHead>VENDOR</TableHead>
                    <TableHead>CITY</TableHead>
                    <TableHead>LGA</TableHead>
                    <TableHead>STATE</TableHead>
                    <TableHead>SUB VENDOR</TableHead>
                    <TableHead>AIRTEL ZONE</TableHead>
                    <TableHead>LATITUDE</TableHead>
                    <TableHead>LONGITUDE</TableHead>
                    <TableHead>SITE ADDRESS</TableHead>
                    <TableHead>AIRTEL ATO</TableHead>
                    <TableHead>AIRTEL ATO CONTACT</TableHead>
                  </>
                )}
                {provider === 'mtn' && (
                  <>
                    <TableHead>State</TableHead>
                    <TableHead>List of Segment</TableHead>
                    <TableHead>Network Type</TableHead>
                    <TableHead>Distance Km</TableHead>
                  </>
                )}
                {provider === 'glo' && (
                  <>
                    <TableHead>Site ID</TableHead>
                    <TableHead>Site Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Coordinates</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {sites.map((site, index) => {
                const fallbackKey = `${provider}-${index}-${sanitizeKeyPart(site.list_of_segment || site.site_id || site.site_name || '')}`;
                const rowKey = site.unique_key || site.id || fallbackKey;

                return (
                  <TableRow key={rowKey}>
                    {provider === 'airtel' && (
                      <>
                        <TableCell className="font-mono text-sm">{site.site_name || site['SITE ID'] || site.site_id || '—'}</TableCell>
                        <TableCell>{site['VENDOR'] || '—'}</TableCell>
                        <TableCell>{site['CITY'] || site.city || '—'}</TableCell>
                        <TableCell>{site['LGA'] || '—'}</TableCell>
                        <TableCell>{site['STATE'] || site.state || '—'}</TableCell>
                        <TableCell>{site['SUB VENDOR'] || '—'}</TableCell>
                        <TableCell>{site['AIRTEL ZONE'] || '—'}</TableCell>
                        <TableCell>{site['LATITUDE'] || site.latitude || '—'}</TableCell>
                        <TableCell>{site['LONGITUDE'] || site.longitude || '—'}</TableCell>
                        <TableCell className="max-w-xs truncate" title={site['SITE ADDRESS'] || site.address}>
                          {site['SITE ADDRESS'] || site.address || '—'}
                        </TableCell>
                        <TableCell>{site['AIRTEL ATO'] || '—'}</TableCell>
                        <TableCell>{site['AIRTEL ATO CONTACT'] || '—'}</TableCell>
                      </>
                    )}

                    {provider === 'mtn' && (
                      <>
                        <TableCell>{site.state || site['State'] || '—'}</TableCell>
                        <TableCell>{site.list_of_segment || site['List of Segment'] || site.segment || '—'}</TableCell>
                        <TableCell>{site.network_type || site['Network Type'] || '—'}</TableCell>
                        <TableCell>
                          {site.distance_km !== undefined && site.distance_km !== null
                            ? site.distance_km
                            : site['Distance Km'] ?? '—'}
                        </TableCell>
                      </>
                    )}

                    {provider === 'glo' && (
                      <>
                        <TableCell className="font-mono text-sm">{site.site_id || '—'}</TableCell>
                        <TableCell className="font-medium">{site.site_name || '—'}</TableCell>
                        <TableCell>{site.city || '—'}</TableCell>
                        <TableCell>{site.state || '—'}</TableCell>
                        <TableCell className="max-w-xs truncate" title={site.address}>{site.address || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {site.latitude && site.longitude ? (
                            <span>
                              {isNaN(Number(site.latitude)) ? String(site.latitude) : Number(site.latitude).toFixed(4)},{' '}
                              {isNaN(Number(site.longitude)) ? String(site.longitude) : Number(site.longitude).toFixed(4)}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {sites.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {profile?.role === 'fibre_network' ? (
                <p className="text-sm mt-2">Use the Import file button to add sites.</p>
              ) : (
                <p>No sites available.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
