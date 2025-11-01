export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; // must match auth.users.id
          full_name: string | null;
          email: string | null;
          role: "staff" | "admin" | "fibre_network";
          is_team_lead: boolean;
          is_regional_manager: boolean;
          created_at: string; // usually non-null
          updated_at: string | null;
        };
        Insert: {
          id: string; // required to match auth.users.id
          full_name?: string | null;
          email?: string | null;
          role?: "staff" | "admin" | "fibre_network";
          is_team_lead?: boolean;
          is_regional_manager?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: "staff" | "admin" | "fibre_network";
          is_team_lead?: boolean;
          is_regional_manager?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: []; // could define foreign keys here
      };
    };
  };
}
