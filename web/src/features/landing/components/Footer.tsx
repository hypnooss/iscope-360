import React from 'react';

export function Footer() {
    return (
        <footer className="relative z-10 border-t border-border/20 bg-background/40 backdrop-blur-xl">
            <div className="max-w-[1200px] mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">

                <p className="text-sm text-muted-foreground/60">
                    © {new Date().getFullYear()} Precisio Analytics. Todos os direitos reservados.
                </p>

                <div className="flex gap-8">
                    {[
                        { label: 'Produto', href: '#features' },
                        { label: 'Integrações', href: '#integrations' },
                        { label: 'Segurança', href: '#problem' },
                        { label: 'Docs', href: '#blog' },
                        { label: 'Contato', href: '#cta' },
                    ].map((link) => (
                        <button
                            key={link.href}
                            onClick={() =>
                                document.querySelector(link.href)?.scrollIntoView({ behavior: 'smooth' })
                            }
                            className="text-sm text-muted-foreground/60 hover:text-foreground transition-colors duration-200"
                        >
                            {link.label}
                        </button>
                    ))}
                </div>

            </div>
        </footer>
    );
}