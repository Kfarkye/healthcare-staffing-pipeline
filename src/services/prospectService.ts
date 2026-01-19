// Re-export from shared services with legacy interface compatibility
import { DataService } from '../shared/services/dataService';
import type { Prospect } from '../shared/types/database';

export class ProspectService {
    static async getAll(): Promise<Prospect[]> {
        return DataService.getProspects();
    }

    static async create(prospect: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>): Promise<Prospect> {
        return DataService.createProspect(prospect);
    }

    static async update(id: number, updates: Partial<Prospect>): Promise<Prospect> {
        return DataService.updateProspect(id, updates);
    }

    static async delete(id: number): Promise<void> {
        // This method would need to be added to DataService if needed
        throw new Error('Delete method not implemented in shared DataService');
    }
}