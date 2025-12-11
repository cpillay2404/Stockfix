export interface Task {
  // Identification
  uniqueId: string;
  key: string;
  
  // Organization
  client: string;
  banner: string;
  region: string;
  storeName: string;
  repName: string;
  lineManager: string;
  
  // Product Info
  category: string;
  barcode: string;
  articleDescription: string;
  
  // Metrics / Data
  dcSoh: string;        // Distribution Center Stock on Hand
  storeSoh: string;     // Store Stock on Hand
  p4WeekSales: string;
  missedSales: string;
  storeWfc: string;     // Weeks Forward Cover?
  stockClassification: string;
  
  // Action Required
  action: string;
  actionDate: string;
  
  // Feedback / Result (To be filled by rep)
  feedback?: string;
  captureDate?: string;
  actionStatus: 'Pending' | 'Completed' | 'Skipped';
  reasonCode?: string;
  actionTakenComment?: string;
  
  // Images
  image1?: string;      // Proof of action
  image2?: string;      // Secondary proof
  systemImage?: string; // Reference image
  piImage?: string;     // Planogram/Inventory image
}

export const mockTasks: Task[] = [
  {
    uniqueId: 'UID-001',
    key: 'K-101',
    client: 'PowerBev Inc.',
    banner: 'SuperMart',
    region: 'North-East',
    storeName: 'SuperMart Downtown #104',
    repName: 'John Doe',
    lineManager: 'Sarah Smith',
    category: 'Beverages',
    barcode: '882910293',
    articleDescription: 'Energy Drink 500ml - Berry Blast',
    dcSoh: '500',
    storeSoh: '12',
    p4WeekSales: '48',
    missedSales: '120.00',
    storeWfc: '1.0',
    stockClassification: 'Core Range',
    action: 'Verify Shelf Availability',
    actionDate: '2025-12-12',
    actionStatus: 'Pending',
    systemImage: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=400'
  },
  {
    uniqueId: 'UID-002',
    key: 'K-102',
    client: 'HealthySnacks Co.',
    banner: 'SuperMart',
    region: 'North-East',
    storeName: 'SuperMart Downtown #104',
    repName: 'John Doe',
    lineManager: 'Sarah Smith',
    category: 'Snacks',
    barcode: '99210221',
    articleDescription: 'Oat Bar - Chocolate Chip 50g',
    dcSoh: '1200',
    storeSoh: '0',
    p4WeekSales: '200',
    missedSales: '450.00',
    storeWfc: '0.0',
    stockClassification: 'Promo Item',
    action: 'Restock End Cap',
    actionDate: '2025-12-12',
    actionStatus: 'Pending',
    systemImage: 'https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?auto=format&fit=crop&q=80&w=400'
  },
  {
    uniqueId: 'UID-003',
    key: 'K-205',
    client: 'AquaPure',
    banner: 'QuickShop',
    region: 'West',
    storeName: 'QuickShop Westside #205',
    repName: 'John Doe',
    lineManager: 'Mike Jones',
    category: 'Beverages',
    barcode: '33211002',
    articleDescription: 'Sparkling Water - Lemon 1L',
    dcSoh: '50',
    storeSoh: '50',
    p4WeekSales: '60',
    missedSales: '0.00',
    storeWfc: '3.5',
    stockClassification: 'Core Range',
    action: 'Check Pricing Label',
    actionDate: '2025-12-10',
    actionStatus: 'Completed',
    feedback: 'Label was missing, printed new one.',
    actionTakenComment: 'Replaced label',
    captureDate: '2025-12-10',
    image1: 'https://images.unsplash.com/photo-1606859191214-25806e8e2423?auto=format&fit=crop&q=80&w=400'
  },
  {
    uniqueId: 'UID-004',
    key: 'K-301',
    client: 'BeanRoasters',
    banner: 'HyperMax',
    region: 'North',
    storeName: 'HyperMax North Mall #301',
    repName: 'John Doe',
    lineManager: 'Sarah Smith',
    category: 'Coffee',
    barcode: '11029331',
    articleDescription: 'Premium Coffee Beans 1kg',
    dcSoh: '200',
    storeSoh: '5',
    p4WeekSales: '20',
    missedSales: '85.00',
    storeWfc: '0.8',
    stockClassification: 'Premium',
    action: 'Audit Promotional Signage',
    actionDate: '2025-12-12',
    actionStatus: 'Pending',
    systemImage: 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400'
  }
];
