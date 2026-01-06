import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface AttentionSku {
  uniqueId: string;
  action: string;
  articleDescription: string;
  barcode: string;
  client: string;
  storeSoh: string;
  p4WeekSales: string;
  storeWfc: string;
  attentionScore: number;
}

interface TopAttentionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skus: AttentionSku[];
  rep: string;
  store: string;
  client: string;
}

export function TopAttentionModal({ open, onOpenChange, skus, rep, store, client }: TopAttentionModalProps) {
  const [, setLocation] = useLocation();

  const handleOpenTask = (sku: AttentionSku) => {
    const params = new URLSearchParams();
    if (rep) params.set('rep', rep);
    if (store) params.set('store', store);
    if (sku.client) params.set('client', sku.client);
    setLocation(`/task/${sku.uniqueId}?${params.toString()}`);
    onOpenChange(false);
  };

  const formatWfc = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return 'N/A';
    return num.toFixed(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: '420px', maxHeight: '80vh', overflow: 'auto' }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#DC2626', fontSize: '18px', fontWeight: 700 }}>
            Critical SKUs
          </DialogTitle>
        </DialogHeader>
        
        {skus.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
            No critical SKUs for this selection.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {skus.map((sku, index) => (
              <div
                key={sku.uniqueId}
                data-testid={`attention-sku-${index}`}
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: '8px',
                  padding: '12px',
                  border: '1px solid #E5E7EB',
                }}
              >
                <div style={{ 
                  fontSize: '11px', 
                  color: '#FFFFFF', 
                  backgroundColor: '#F36C21',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  display: 'inline-block',
                }}>
                  {sku.action}
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '4px' }}>
                  {sku.articleDescription}
                </div>
                
                <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#6B7280', marginBottom: '4px' }}>
                  {sku.barcode}
                </div>
                
                <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
                  {sku.client}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' }}>Store SOH</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#003B71' }}>{sku.storeSoh}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' }}>Sell Out (P4 weeks)</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#003B71' }}>{sku.p4WeekSales}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' }}>WFC</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#003B71' }}>{formatWfc(sku.storeWfc)}</div>
                  </div>
                </div>
                
                <Button
                  onClick={() => handleOpenTask(sku)}
                  data-testid={`button-open-task-${index}`}
                  style={{
                    width: '100%',
                    height: '36px',
                    backgroundColor: '#003B71',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '6px',
                  }}
                >
                  Open Task
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
