import React from 'react';
import { useNavigate } from "react-router-dom";

export function Footer() {
    const navigate = useNavigate();

    const handleClick = (href: string) => {
        if (href.startsWith('/#')) {
            navigate(href);
            return;
        }

        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <footer className="relative z-10 border-t border-border/20 bg-background/40 backdrop-blur-xl">
            <div className="max-w-[1200px] mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">

                <p className="text-sm text-muted-foreground/60">
                    © {new Date().getFullYear()} Precisio Analytics. Todos os direitos reservados.
                </p>

                <div className="flex gap-8">
                    {[
                        { label: 'Produto', href: '/#features' },
                        { label: 'Integrações', href: '/#integrations' },
                        { label: 'Segurança', href: '/#problem' },
                        { label: 'Docs', href: '/#blog' },
                        { label: 'Contato', href: '/#cta' },
                    ].map((link) => (
                        <button
                            key={link.href}
                            onClick={() => handleClick(link.href)}
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