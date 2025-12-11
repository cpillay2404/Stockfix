export interface Task {
  id: string;
  store: string;
  sku: string;
  productName: string;
  client: string;
  description: string;
  status: 'pending' | 'completed';
  feedback?: string;
  imageUrl?: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
}

export const mockTasks: Task[] = [
  {
    id: '1',
    store: 'Store #104 - Downtown',
    sku: 'SKU-78291',
    productName: 'Energy Drink 500ml - Berry',
    client: 'PowerBev Inc.',
    description: 'Verify shelf placement is eye-level and check for expired stock.',
    status: 'pending',
    priority: 'high',
    dueDate: '2025-12-12',
  },
  {
    id: '2',
    store: 'Store #104 - Downtown',
    sku: 'SKU-99210',
    productName: 'Oat Bar - Chocolate Chip',
    client: 'HealthySnacks Co.',
    description: 'Restock end-cap display. Ensure pricing label is visible.',
    status: 'pending',
    priority: 'medium',
    dueDate: '2025-12-13',
  },
  {
    id: '3',
    store: 'Store #205 - Westside',
    sku: 'SKU-33211',
    productName: 'Sparkling Water - Lemon',
    client: 'AquaPure',
    description: 'Check inventory levels in the backroom vs shelf.',
    status: 'completed',
    feedback: 'Backroom stock is low, shelf fully stocked.',
    imageUrl: 'https://images.unsplash.com/photo-1606859191214-25806e8e2423?auto=format&fit=crop&q=80&w=400',
    priority: 'low',
    dueDate: '2025-12-10',
  },
  {
    id: '4',
    store: 'Store #301 - North Mall',
    sku: 'SKU-11029',
    productName: 'Premium Coffee Beans',
    client: 'BeanRoasters',
    description: 'Audit promotional signage placement.',
    status: 'pending',
    priority: 'high',
    dueDate: '2025-12-12',
  },
  {
    id: '5',
    store: 'Store #104 - Downtown',
    sku: 'SKU-55402',
    productName: 'Protein Shake - Vanilla',
    client: 'MuscleFuel',
    description: 'Ensure "Buy 2 Get 1 Free" tags are removed.',
    status: 'pending',
    priority: 'medium',
    dueDate: '2025-12-14',
  },
];
