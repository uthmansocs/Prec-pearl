// EscalationForm.tsx
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EscalationStatus, ProviderType, Site } from "@/types/database";
import debounce from "lodash.debounce";

interface EscalationFormProps {
  provider: ProviderType;
  onSuccess: () => void;
  sites?: Site[]; // optional preloaded sites (MTN)
  selectedSites?: { siteA?: Site; siteB?: Site; linkId?: string };
  setSelectedSites?: React.Dispatch<
    React.SetStateAction<{ siteA?: Site; siteB?: Site; linkId?: string }>
  >;
}

/* ---------------------- helpers ---------------------- */
const sanitizeKeyPart = (s?: string) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9\-_]/g, "")
    .slice(0, 80);

/** compute non-empty select value for a site (guaranteed unique per array index) */
const computeSelectValue = (site: any, idx: number, provider: ProviderType) => {
  // Prefer list_of_segment for MTN, else site_id / id
  if (provider === "mtn") {
    const seg = site?.list_of_segment ? sanitizeKeyPart(site.list_of_segment) : "";
    const idPart = site?.id ?? site?.site_id ?? idx;
    return `mtn-${seg || "unknown"}-${String(idPart)}`;
  } else {
    const name = site?.site_name ? sanitizeKeyPart(site.site_name) : "";
    const idPart = site?.id ?? site?.site_id ?? idx;
    return `${provider}-${name || "unknown"}-${String(idPart)}`;
  }
};

/* ---------------------- Site Details Card ---------------------- */
const SiteDetailsCard = ({
  title = "Site Details",
  site,
}: {
  title?: string;
  site?: Site | any;
}) => {
  if (!site) return null;
  return (
    <div className="p-0">
      <div className="bg-white/90 dark:bg-gray-800/90 rounded-lg border">
        <div className="px-4 py-2 border-b">
          <div className="text-sm font-medium">{title}</div>
        </div>

        <div className="p-4 text-sm grid grid-cols-2 gap-2">
          <div className="text-muted-foreground">Name</div>
          <div className="font-medium">
            {site.site_name || site.site_id || site.list_of_segment || site.id || "—"}
          </div>

          <div className="text-muted-foreground">Site ID / Segment</div>
          <div className="font-mono text-sm">
            {site.site_id ?? site.list_of_segment ?? site.id ?? "—"}
          </div>

          <div className="text-muted-foreground">City</div>
          <div>{site.city || site.CITY || "—"}</div>

          <div className="text-muted-foreground">State</div>
          <div>{site.state || site.STATE || "—"}</div>

          <div className="text-muted-foreground">Address</div>
          <div className="max-w-xs truncate">
            {site.address || site["SITE ADDRESS"] || "—"}
          </div>

          {(site.latitude || site.longitude || site.LATITUDE || site.LONGITUDE) && (
            <>
              <div className="text-muted-foreground">Coordinates</div>
              <div className="text-xs">
                {(site.latitude ?? site.LATITUDE) ?? "—"},{" "}
                {(site.longitude ?? site.LONGITUDE) ?? "—"}
              </div>
            </>
          )}

          {site["VENDOR"] && (
            <>
              <div className="text-muted-foreground">Vendor</div>
              <div>{site["VENDOR"]}</div>
            </>
          )}

          {site["AIRTEL ZONE"] && (
            <>
              <div className="text-muted-foreground">Zone</div>
              <div>{site["AIRTEL ZONE"]}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------------- EscalationForm Component ---------------------- */
export const EscalationForm: React.FC<EscalationFormProps> = ({
  provider,
  onSuccess,
  sites: sitesProp,
  selectedSites: selectedSitesProp,
  setSelectedSites: setSelectedSitesProp,
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();

  // search inputs & results
  const [searchTermA, setSearchTermA] = useState("");
  const [searchResultsA, setSearchResultsA] = useState<Site[]>([]);
  const [searchingA, setSearchingA] = useState(false);

  const [searchTermB, setSearchTermB] = useState("");
  const [searchResultsB, setSearchResultsB] = useState<Site[]>([]);
  const [searchingB, setSearchingB] = useState(false);

  // selectedSites (object) and also the select-value strings (so Select's value always matches a non-empty string)
  const [localSelectedSites, setLocalSelectedSites] = useState<{ siteA?: Site; siteB?: Site }>({});
  const selectedSites = selectedSitesProp ?? localSelectedSites;
  const setSelectedSites = setSelectedSitesProp ?? setLocalSelectedSites;

  const [selectedValueA, setSelectedValueA] = useState<string>("");
  const [selectedValueB, setSelectedValueB] = useState<string>("");

  const [formData, setFormData] = useState({ mttrHours: "", description: "" });
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  // staff lists
  const [regionalManagers, setRegionalManagers] = useState<{ id: string; full_name: string }[]>([]);
  const [teamLeads, setTeamLeads] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedRegionalManager, setSelectedRegionalManager] = useState<string>("");
  const [selectedTeamLead, setSelectedTeamLead] = useState<string>("");

  // Preload MTN `sitesProp` into searchResultsA (helpful UX)
  useEffect(() => {
    if (provider === "mtn" && Array.isArray(sitesProp) && sitesProp.length > 0) {
      setSearchResultsA(sitesProp);
    }
  }, [provider, sitesProp]);

  // Generic search function (adapts field by provider)
  const performSearch = async (
    term: string,
    setter: (s: Site[]) => void,
    setLoading: (b: boolean) => void
  ) => {
    if (!term.trim()) {
      setter([]); // clear results to avoid huge lists
      return;
    }
    setLoading(true);
    try {
      const table = `${provider}_sites`;
      const searchField = provider === "mtn" ? "list_of_segment" : "site_name";
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .ilike(searchField, `%${term}%`)
        .limit(200);

      if (error) throw error;
      setter((data ?? []) as Site[]);
    } catch (err) {
      console.error("Supabase search error:", err);
      setter([]);
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearchA = useMemo(() => debounce((t: string) => performSearch(t, setSearchResultsA, setSearchingA), 300), [provider]);
  const debouncedSearchB = useMemo(() => debounce((t: string) => performSearch(t, setSearchResultsB, setSearchingB), 300), [provider]);

  useEffect(() => {
    debouncedSearchA(searchTermA);
    return () => debouncedSearchA.cancel();
  }, [searchTermA, debouncedSearchA]);

  useEffect(() => {
    debouncedSearchB(searchTermB);
    return () => debouncedSearchB.cancel();
  }, [searchTermB, debouncedSearchB]);

  // when selectedSites change externally, keep select-value strings in-sync
  useEffect(() => {
    // sync A
    if (selectedSites.siteA) {
      // find index in current result list if present, else fallback idx 0
      const idx = searchResultsA.findIndex((s) => {
        // match by id OR list_of_segment OR site_id
        if (!s) return false;
        return (
          String(s.id) === String(selectedSites.siteA?.id) ||
          String(s.list_of_segment) === String(selectedSites.siteA?.list_of_segment) ||
          String(s.site_id) === String(selectedSites.siteA?.site_id)
        );
      });
      setSelectedValueA(computeSelectValue(selectedSites.siteA, idx >= 0 ? idx : 0, provider));
    } else {
      setSelectedValueA("");
    }

    // sync B
    if (selectedSites.siteB) {
      const idx = searchResultsB.findIndex((s) => {
        if (!s) return false;
        return (
          String(s.id) === String(selectedSites.siteB?.id) ||
          String(s.site_id) === String(selectedSites.siteB?.site_id)
        );
      });
      setSelectedValueB(computeSelectValue(selectedSites.siteB, idx >= 0 ? idx : 0, provider));
    } else {
      setSelectedValueB("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSites, searchResultsA, searchResultsB]);

  // fetch staff lists
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { data: rmData, error: rmError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("is_regional_manager", true);

        if (rmError) console.warn("Error fetching RMs:", rmError);

        const { data: tlData, error: tlError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("is_team_lead", true);

        if (tlError) console.warn("Error fetching TLs:", tlError);

        setRegionalManagers(rmData ?? []);
        setTeamLeads(tlData ?? []);
      } catch (err) {
        console.error("fetchStaff failed:", err);
        setRegionalManagers([]);
        setTeamLeads([]);
      }
    };

    if (profile?.role === "fibre_network") {
      fetchStaff();
    }
  }, [profile]);

  // id & ticket generators
  const generateIds = () => {
    const ticketId = `TCK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    if (provider === "mtn") {
      if (!selectedSites.siteA) throw new Error("Please select an MTN segment before creating escalation.");
      const linkId = selectedSites.siteA.list_of_segment ?? selectedSites.siteA.site_id ?? "";
      return { linkId, ticketId };
    } else {
      if (!selectedSites.siteA || !selectedSites.siteB) throw new Error("Both Site A and Site B must be selected");
      const linkId = `${selectedSites.siteA.site_name}-${selectedSites.siteB.site_name}`;
      return { linkId, ticketId };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const isMTN = provider === "mtn";

    if ((isMTN && !selectedSites.siteA) || (!isMTN && (!selectedSites.siteA || !selectedSites.siteB)) || !formData.mttrHours || !formData.description) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    if (profile.role === "fibre_network" && (!selectedRegionalManager || !selectedTeamLead)) {
      toast({ title: "Error", description: "Please assign both Regional Manager and Team Lead", variant: "destructive" });
      return;
    }

    if (parseFloat(formData.mttrHours) < 0.1) {
      toast({ title: "Error", description: "MTTR must be at least 0.1 hours", variant: "destructive" });
      return;
    }

    // ensure siteA != siteB for non-MTN
    if (!isMTN && ((selectedSites.siteA?.id ?? selectedSites.siteA?.site_id)?.toString() === (selectedSites.siteB?.id ?? selectedSites.siteB?.site_id)?.toString())) {
      toast({ title: "Error", description: "Site A and Site B must be different", variant: "destructive" });
      return;
    }

    setLoadingSubmit(true);
    try {
      const { linkId, ticketId } = generateIds();

      const payload: any = {
        provider,
        ticket_id: ticketId,
        mttr_hours: parseFloat(formData.mttrHours),
        status: "pending" as EscalationStatus,
        description: formData.description,
        created_by: profile.id,
      };

      if (isMTN) {
        payload.list_of_segment = selectedSites.siteA?.list_of_segment ?? selectedSites.siteA?.site_id ?? null;
        payload.link_id = linkId || null;
      } else {
        payload.site_a_id = (selectedSites.siteA?.id ?? selectedSites.siteA?.site_id)?.toString();
        payload.site_b_id = (selectedSites.siteB?.id ?? selectedSites.siteB?.site_id)?.toString();
        payload.link_id = linkId;
      }

      if (profile.role === "fibre_network") {
        payload.regional_manager_id = selectedRegionalManager || null;
        payload.team_lead_id = selectedTeamLead || null;
      }

      const { error } = await supabase.from("escalations").insert(payload);
      if (error) throw error;

      toast({ title: "Success", description: `Link escalation created: ${ticketId}` });

      // reset form
      setFormData({ mttrHours: "", description: "" });
      setSelectedSites({});
      setSelectedRegionalManager("");
      setSelectedTeamLead("");
      setSelectedValueA("");
      setSelectedValueB("");
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Unexpected error", variant: "destructive" });
    } finally {
      setLoadingSubmit(false);
    }
  };

  const submitDisabledForAssignment = profile?.role === "fibre_network" && (!selectedRegionalManager || !selectedTeamLead);

  /* ---------------------- RENDER ---------------------- */
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Link Escalation - {provider.toUpperCase()}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* MTN: single-select segment */}
          {provider === "mtn" ? (
            <div className="space-y-2">
              <Label>Select MTN Segment *</Label>
              <Input placeholder="Search MTN segment..." value={searchTermA} onChange={(e) => setSearchTermA(e.target.value)} />
              <Select
                value={selectedValueA}
                onValueChange={(val) => {
                  setSelectedValueA(val);
                  // map back to site object
                  const found = searchResultsA.find((s, i) => computeSelectValue(s, i, provider) === val);
                  if (found) setSelectedSites({ siteA: found });
                  else {
                    // maybe the user selected a preloaded `sitesProp` item; check there too
                    const alt = (sitesProp ?? []).find((s, i) => computeSelectValue(s, i, provider) === val);
                    if (alt) setSelectedSites({ siteA: alt });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select MTN Segment" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-auto">
                  {searchingA && <div className="px-4 py-2 text-xs">Searching…</div>}
                  {!searchingA && searchResultsA.length === 0 && (
                    <div className="px-4 py-2 text-xs text-muted-foreground">No results</div>
                  )}
                  {!searchingA &&
                    searchResultsA.map((site, i) => {
                      const val = computeSelectValue(site, i, provider);
                      return (
                        <SelectItem key={val} value={val}>
                          {site.list_of_segment ?? site.site_name ?? site.site_id ?? `Segment ${i}`} {site.state ? `— ${site.state}` : ""}
                        </SelectItem>
                      );
                    })}
                  {/* include sitesProp items if provided and searchResultsA empty (preloaded list) */}
                  {!searchingA && searchResultsA.length === 0 && Array.isArray(sitesProp) && sitesProp.length > 0 && (
                    <>
                      {(sitesProp).map((site, i) => {
                        const val = computeSelectValue(site, i, provider);
                        return (
                          <SelectItem key={`prop-${val}`} value={val}>
                            {site.list_of_segment ?? site.site_name ?? site.site_id ?? `Segment ${i}`} {site.state ? `— ${site.state}` : ""}
                          </SelectItem>
                        );
                      })}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            // non-MTN (Airtel / Glo) two-site selector
            <>
              {/* Site A */}
              <div className="space-y-2">
                <Label>Search Site A *</Label>
                <Input placeholder="Start typing site name..." value={searchTermA} onChange={(e) => setSearchTermA(e.target.value)} />
                <Select
                  value={selectedValueA}
                  onValueChange={(val) => {
                    setSelectedValueA(val);
                    const found = searchResultsA.find((s, i) => computeSelectValue(s, i, provider) === val);
                    if (found) setSelectedSites((prev) => ({ ...prev, siteA: found }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Site A" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-auto">
                    {searchingA && <div className="px-4 py-2 text-xs">Searching…</div>}
                    {!searchingA &&
                      searchResultsA.map((site, i) => {
                        const val = computeSelectValue(site, i, provider);
                        return <SelectItem key={val} value={val}>{site.site_name ?? site.site_id ?? `Site ${i}`}</SelectItem>;
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Site B */}
              <div className="space-y-2">
                <Label>Search Site B *</Label>
                <Input placeholder="Start typing site name..." value={searchTermB} onChange={(e) => setSearchTermB(e.target.value)} />
                <Select
                  value={selectedValueB}
                  onValueChange={(val) => {
                    setSelectedValueB(val);
                    const found = searchResultsB.find((s, i) => computeSelectValue(s, i, provider) === val);
                    if (found) setSelectedSites((prev) => ({ ...prev, siteB: found }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Site B" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-auto">
                    {searchingB && <div className="px-4 py-2 text-xs">Searching…</div>}
                    {!searchingB &&
                      searchResultsB.map((site, i) => {
                        const val = computeSelectValue(site, i, provider);
                        return <SelectItem key={val} value={val}>{site.site_name ?? site.site_id ?? `Site ${i}`}</SelectItem>;
                      })}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* site details preview */}
          {(selectedSites.siteA || selectedSites.siteB) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {selectedSites.siteA && <SiteDetailsCard title={provider === "mtn" ? "Segment Details" : "Site A Details"} site={selectedSites.siteA} />}
              {provider !== "mtn" && selectedSites.siteB && <SiteDetailsCard title="Site B Details" site={selectedSites.siteB} />}
            </div>
          )}

          {/* staff assignment */}
          {profile?.role === "fibre_network" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Regional Manager *</Label>
                <Select value={selectedRegionalManager} onValueChange={(id) => setSelectedRegionalManager(id)}>
                  <SelectTrigger><SelectValue placeholder="Select Regional Manager" /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-auto">
                    {regionalManagers.length === 0 && <div className="px-4 py-2 text-xs text-muted-foreground">No Regional Managers found</div>}
                    {regionalManagers.map((rm) => <SelectItem key={rm.id} value={rm.id}>{rm.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team Lead *</Label>
                <Select value={selectedTeamLead} onValueChange={(id) => setSelectedTeamLead(id)}>
                  <SelectTrigger><SelectValue placeholder="Select Team Lead" /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-auto">
                    {teamLeads.length === 0 && <div className="px-4 py-2 text-xs text-muted-foreground">No Team Leads found</div>}
                    {teamLeads.map((tl) => <SelectItem key={tl.id} value={tl.id}>{tl.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* MTTR & description */}
          <div className="space-y-2">
            <Label>MTTR (Hours) *</Label>
            <Input type="number" step="0.1" min="0.1" value={formData.mttrHours} onChange={(e) => setFormData((p) => ({ ...p, mttrHours: e.target.value }))} required />
          </div>

          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} rows={3} required />
          </div>

          <Button type="submit" disabled={loadingSubmit || submitDisabledForAssignment} className="w-full">
            {loadingSubmit ? "Creating..." : "Create Link Escalation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default EscalationForm;
