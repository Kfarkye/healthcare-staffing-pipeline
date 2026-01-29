import { supabase } from '../lib/supabase';
import type {
  Facility,
  FacilityInput,
  Job,
  JobInput,
  JobWithFacility,
  Engagement,
  EngagementInput,
  EngagementWithRelations,
  Exit,
  ExitInput,
  ExitWithRelations,
  JobStatus,
  EngagementStatus
} from '../types/schema';

// ============================================================================
// UTILITY: Sanitize input (convert empty strings to null)
// ============================================================================

const sanitizeInput = <T extends Record<string, any>>(data: T): T => {
  const sanitized = { ...data } as any;
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === '') {
      sanitized[key] = null;
    }
  });
  return sanitized as T;
};

// ============================================================================
// FACILITIES SERVICE
// ============================================================================

export const facilitiesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('facilities')
      .select('*')
      .order('name');

    if (error) throw error;
    return data as Facility[];
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('facilities')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Facility;
  },

  async create(input: FacilityInput) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('facilities')
      .insert(sanitized)
      .select()
      .single();

    if (error) throw error;
    return data as Facility;
  },

  async update(id: number, input: Partial<FacilityInput>) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('facilities')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Facility;
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('facilities')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// ============================================================================
// JOBS SERVICE
// ============================================================================

export const jobsService = {
  async getAll(filters?: { status?: JobStatus; specialty?: string }) {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        facility:facilities(name, city, state)
      `)
      .order('start_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.specialty) {
      query = query.eq('specialty', filters.specialty);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as JobWithFacility[];
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        facility:facilities(name, city, state)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as JobWithFacility;
  },

  async create(input: JobInput) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('jobs')
      .insert(sanitized)
      .select()
      .single();

    if (error) throw error;
    return data as Job;
  },

  async update(id: number, input: Partial<JobInput>) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('jobs')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Job;
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// ============================================================================
// ENGAGEMENTS SERVICE
// ============================================================================

export const engagementsService = {
  async getAll(filters?: { status?: EngagementStatus; prospect_id?: number }) {
    let query = supabase
      .from('engagements')
      .select(`
        *,
        prospect:prospects(name),
        job:jobs(
          *,
          facility:facilities(name, city, state)
        )
      `)
      .order('start_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.prospect_id) {
      query = query.eq('prospect_id', filters.prospect_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as EngagementWithRelations[];
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('engagements')
      .select(`
        *,
        prospect:prospects(name),
        job:jobs(
          *,
          facility:facilities(name, city, state)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as EngagementWithRelations;
  },

  async create(input: EngagementInput) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('engagements')
      .insert(sanitized)
      .select()
      .single();

    if (error) throw error;
    return data as Engagement;
  },

  async update(id: number, input: Partial<EngagementInput>) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('engagements')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Engagement;
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('engagements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// ============================================================================
// EXITS SERVICE
// ============================================================================

export const exitsService = {
  async getAll(filters?: { exit_type?: string; prospect_id?: number }) {
    let query = supabase
      .from('exits')
      .select(`
        *,
        prospect:prospects(name),
        engagement:engagements(start_date, end_date)
      `)
      .order('exit_date', { ascending: false });

    if (filters?.exit_type) {
      query = query.eq('exit_type', filters.exit_type);
    }
    if (filters?.prospect_id) {
      query = query.eq('prospect_id', filters.prospect_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as ExitWithRelations[];
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('exits')
      .select(`
        *,
        prospect:prospects(name),
        engagement:engagements(start_date, end_date)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as ExitWithRelations;
  },

  async create(input: ExitInput) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('exits')
      .insert(sanitized)
      .select()
      .single();

    if (error) throw error;
    return data as Exit;
  },

  async update(id: number, input: Partial<ExitInput>) {
    const sanitized = sanitizeInput(input);
    const { data, error } = await supabase
      .from('exits')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Exit;
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('exits')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
