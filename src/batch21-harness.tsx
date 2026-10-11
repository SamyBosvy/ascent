import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ResponsiveDialog } from './components/app/ResponsiveDialog';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Button } from './components/ui/button';
import { BarChart, LineChart, XAxis, YAxis } from 'recharts';
import { MotionBar, MotionLine, MotionTooltip } from './components/app/MotionChart';

function Harness() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  const data = [{ week: '1', minutes: 20, retention: 60 }, { week: '2', minutes: 40, retention: 80 }];
  return <div className="p-4 space-y-4"><h1 className="page-title">Insights</h1>
    <Button onClick={() => setDrawer(true)}>Open drawer</Button>
    <Button onClick={() => setDialog(true)}>Open dialog</Button>
    <Button onClick={() => toast.success('Motion check')}>Show toast</Button>
    <BarChart width={350} height={200} data={data}><XAxis dataKey="week" /><YAxis /><MotionBar dataKey="minutes" fill="var(--primary)" /><MotionTooltip /></BarChart>
    <LineChart width={350} height={200} data={data}><MotionLine dataKey="retention" stroke="var(--primary)" /><MotionTooltip /></LineChart>
    <ResponsiveDialog open={drawer} onOpenChange={setDrawer} title="Test drawer" description="Motion check"><p>Drawer content</p></ResponsiveDialog>
    <Dialog open={dialog} onOpenChange={setDialog}><DialogContent><DialogTitle>Test dialog</DialogTitle><DialogDescription>Motion check</DialogDescription></DialogContent></Dialog>
    <Toaster />
  </div>;
}
export function mount() {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  createRoot(host).render(<Harness />);
}