// ============================================================================
// src/components/handbook/TravelerHandbook.tsx
// Stealth Traveler Handbook - A premium, public-facing resource guide
// Designed to be decoupled from company branding for recruiter authority.
// ============================================================================

import React from 'react';
import { Home, DollarSign, Clipboard, ArrowRight } from 'lucide-react';
import '../../styles/handbook.css';

// ============================================================================
// DATA - Content for the handbook sections
// ============================================================================

const HOUSING_RESOURCES = [
    {
        id: 'furnished-finder',
        title: 'Furnished Finder',
        description: 'The gold standard for travel healthcare housing. Over 150,000 furnished properties specifically for traveling professionals. Use the "Housing Request" feature to let landlords come to you, or search manually by city and assignment dates.',
        link: 'https://www.furnishedfinder.com',
        linkText: 'Explore Furnished Finder',
        icon: '🏠',
        color: 'blue',
    },
    {
        id: 'landing',
        title: 'Landing',
        description: 'New-age flexible housing. Landing offers a network of fully furnished, designer apartments across 375+ cities with no long-term leases and seamless app-based booking. Perfect for high-end traveler comforts.',
        link: 'https://www.hellolanding.com',
        linkText: 'Browse Apartments',
        icon: '🔑',
        color: 'indigo',
    },
    {
        id: 'airbnb',
        title: 'Airbnb / VRBO',
        description: 'Perfect for short-term stays (first 2 weeks) while you scout local areas. Pro tip: Always message hosts directly to negotiate a monthly discount—many will offer 20-30% off for verified healthcare workers.',
        link: 'https://www.airbnb.com',
        linkText: 'Search Airbnb',
        icon: '✈️',
        color: 'green',
    },
    {
        id: 'facebook-marketplace',
        title: 'Facebook Marketplace',
        description: 'The local play. Search for "sublets" or "furnished rentals" in your assignment city. Beware of scams: never pay without video touring the property first. Look for "Travel Nurse Housing" groups in specific cities.',
        link: 'https://www.facebook.com/marketplace',
        linkText: 'Open Marketplace',
        icon: '💬',
        color: 'amber',
    },
];

const MONEY_TIPS = [
    {
        title: 'The "Tax Home" Rule',
        content: 'Your weekly stipend for housing and meals is tax-free as long as you maintain a "tax home." This is your permanent residence—be sure to keep it even when traveling. Consult a tax professional for "tax home" specifics.',
    },
    {
        title: 'Maximize Your Take-Home',
        content: 'The goal is to spend less on housing than your stipend provides. The difference is extra money in your pocket. This is how many travelers earn significantly more than staff nurses.',
    },
    {
        title: 'Negotiate Wisely',
        content: 'Don\'t just look at the weekly gross. Look at the breakdowns. Some agencies shift money between taxable and non-taxable rates. Make sure your taxable rate isn\'t so low it triggers an audit.',
    },
];

const FIRST_48_HOURS = [
    {
        step: 1,
        title: 'Arrive & Settle In',
        description: 'Unpack essentials, check in with your housing, and get a good night\'s sleep. You\'ll hit the ground running tomorrow.',
    },
    {
        step: 2,
        title: 'Facility Check-In',
        description: 'Report to the nurse manager or staffing office. Bring all required documents (license, certifications, ID). You\'ll get your badge and orientation schedule.',
    },
    {
        step: 3,
        title: 'Find Your Landmarks',
        description: 'Locate the breakroom, charting stations, supply rooms, and restrooms. Ask a friendly staff member - they\'ve all been new before.',
    },
    {
        step: 4,
        title: 'Scout the Neighborhood',
        description: 'Find the nearest grocery store, pharmacy, and your go-to coffee spot. Having these basics mapped out will make the first week much smoother.',
    },
];


// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const Hero: React.FC = () => (
    <section className="handbook-hero">
        <img
            src="/traveler_hero.png"
            alt="Modern apartment overlooking city"
            className="handbook-hero__image"
        />
        <div className="handbook-hero__overlay" />
        <div className="handbook-hero__content animate-fade-in-up">
            <h1 className="handbook-hero__title">The Traveler Handbook</h1>
            <p className="handbook-hero__subtitle">
                A definitive guide for the modern healthcare traveler. Master your logistics, maximize your pay, and hit the ground running on day one.
            </p>
        </div>
    </section>
);

const ResourceCard: React.FC<{
    resource: typeof HOUSING_RESOURCES[0];
    index: number;
}> = ({ resource, index }) => (
    <div className={`resource-card animate-fade-in-up animate-delay-${(index % 4) + 1}`}>
        <div className={`resource-card__icon resource-card__icon--${resource.color}`}>
            {resource.icon}
        </div>
        <h3 className="resource-card__title">{resource.title}</h3>
        <p className="resource-card__description">{resource.description}</p>
        <a
            href={resource.link}
            target="_blank"
            rel="noopener noreferrer"
            className="resource-card__link"
        >
            {resource.linkText}
            <ArrowRight size={18} />
        </a>
    </div>
);

const HousingSection: React.FC = () => (
    <section id="housing" className="handbook-section">
        <div className="handbook-section__header">
            <p className="handbook-section__eyebrow">
                <Home size={14} />
                Housing & Logistics
            </p>
            <h2 className="handbook-section__title">Find Your Home Away From Home</h2>
            <p className="handbook-section__description">
                Housing is the single biggest factor in traveler satisfaction. Use these verified resources to secure a safe, comfortable, and profitable home base.
            </p>
        </div>
        <div className="resource-grid">
            {HOUSING_RESOURCES.map((resource, index) => (
                <ResourceCard key={resource.id} resource={resource} index={index} />
            ))}
        </div>
    </section>
);

const MoneySection: React.FC = () => (
    <section id="money" className="handbook-section handbook-section--alt">
        <div className="handbook-section__header">
            <p className="handbook-section__eyebrow">
                <DollarSign size={14} />
                Financial Strategy
            </p>
            <h2 className="handbook-section__title">Understand Your Pay</h2>
            <p className="handbook-section__description">
                Travel pay is structured differently than staff pay. Mastering the split between taxable wages and tax-free stipends is key to your long-term success.
            </p>
        </div>
        <div className="resource-grid">
            {MONEY_TIPS.map((tip, index) => (
                <div key={tip.title} className={`resource-card animate-fade-in-up animate-delay-${index + 1}`}>
                    <h3 className="resource-card__title">{tip.title}</h3>
                    <p className="resource-card__description">{tip.content}</p>
                </div>
            ))}
        </div>
    </section>
);

const ChecklistSection: React.FC = () => (
    <section id="checklist" className="handbook-section">
        <div className="handbook-section__header">
            <p className="handbook-section__eyebrow">
                <Clipboard size={14} />
                Operations
            </p>
            <h2 className="handbook-section__title">Your First 48 Hours</h2>
            <p className="handbook-section__description">
                The first 48 hours of any assignment set the tone for the next 13 weeks. Follow this blueprint to ensure a frictionless transition.
            </p>
        </div>
        <div className="checklist">
            {FIRST_48_HOURS.map((item) => (
                <div key={item.step} className="checklist__item">
                    <div className="checklist__number">{item.step}</div>
                    <div className="checklist__content">
                        <h4 className="checklist__title">{item.title}</h4>
                        <p className="checklist__description">{item.description}</p>
                    </div>
                </div>
            ))}
        </div>
    </section>
);

const Footer: React.FC = () => (
    <footer className="handbook-footer">
        <div className="handbook-footer__content">
            <p className="handbook-footer__signature">
                Curated for Travelers by
            </p>
            <span className="handbook-footer__name">Kofi Farkye</span>
            <p className="handbook-footer__signature" style={{ marginTop: '0.5rem', opacity: 0.5 }}>
                Senior Healthcare Consultant
            </p>
        </div>
    </footer>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TravelerHandbook(): JSX.Element {
    return (
        <div className="handbook-page">
            <Hero />
            <HousingSection />
            <MoneySection />
            <ChecklistSection />
            <Footer />
        </div>
    );
}
