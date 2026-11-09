import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
          <Construction className="w-8 h-8 text-primary-600" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-1">Em construção</h3>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">{description}</p>
      </div>
    </div>
  );
}
