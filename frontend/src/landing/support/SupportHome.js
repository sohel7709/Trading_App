import React from 'react';

const accordionData = [
    {
        id: 'account',
        icon: 'fa-solid fa-plus',
        title: 'Account Opening',
        links: [
            'Resident Individual',
            'Minor',
            'Non Resident Indian (NRI)',
            'Company, Partnership, HUF and LLP',
            'Glossary',
        ],
    },
    {
        id: 'zerodha',
        icon: 'fa-solid fa-user',
        title: 'Your Zerodha Account',
        links: [
            'Your Profile',
            'Account modification',
            'Client Master Report (CMR) and Depository Participant (DP)',
            'Nomination',
            'Transfer and conversion of securities',
        ],
    },
    {
        id: 'kite',
        icon: 'fa-solid fa-chart-simple',
        title: 'Kite',
        links: [
            'IPO',
            'Trading FAQs',
            'Margin Trading Facility (MTF) and Margins',
            'Charts and orders',
            'Alerts and Nudges',
            'General',
        ],
    },
    {
        id: 'funds',
        icon: 'fa-solid fa-indian-rupee-sign',
        title: 'Funds',
        links: ['Add money', 'Withdraw money', 'Add bank accounts', 'eMandates'],
    },
    {
        id: 'console',
        icon: 'fa-solid fa-terminal',
        title: 'Console',
        links: ['Portfolio', 'Corporate actions', 'Funds statement', 'Reports', 'Profile', 'Segments'],
    },
    {
        id: 'coin',
        icon: 'fa-solid fa-coins',
        title: 'Coin',
        links: [
            'Mutual funds',
            'National Pension Scheme (NPS)',
            'Fixed Deposit (FD)',
            'Features on Coin',
            'Payments and Orders',
            'General',
        ],
    },
];

function SupportHome() {
    return (
        <div className="container my-5">
            <div className="row">
                {/* Left Side Accordion */}
                <div className="col-md-8">
                    <div className="accordion" id="supportAccordion">
                        {accordionData.map(({ id, icon, title, links }) => (
                            <div className="accordion-item mb-4" key={id}>
                                <h2 className="accordion-header" id={`${id}-header`}>
                                    <button
                                        className="accordion-button collapsed"
                                        type="button"
                                        data-bs-toggle="collapse"
                                        data-bs-target={`#collapse-${id}`}
                                        aria-expanded="false"
                                        aria-controls={`collapse-${id}`}
                                    >
                                        <i class={icon}></i>
                                        &nbsp;&nbsp;&nbsp;&nbsp;
                                        {title}
                                    </button>
                                </h2>
                                <div
                                    id={`collapse-${id}`}
                                    className="accordion-collapse collapse"
                                    aria-labelledby={`${id}-header`}
                                    data-bs-parent="#supportAccordion"
                                >
                                    <div className="accordion-body">
                                        <ul className="list-unstyled mb-0">
                                            {links.map((link, idx) => (
                                                <li key={idx}>
                                                    <a href="#" className="text-decoration-none text-primary d-block mb-2">
                                                        {link}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="col-md-4">
                    {/* Announcements */}
                    <div className="p-3 mb-3 bg-light border-start border-4 border-warning">
                        <ul className="list-unstyled mb-0">
                            <li>
                                <a href="#" className="text-decoration-underline text-primary">
                                    Quarterly Settlement of Funds – July 2025
                                </a>
                            </li>
                            <li>
                                <a href="#" className="text-decoration-underline text-primary">
                                    Exclusion of F&O contracts on 8 securities from August 29, 2025
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Quick Links */}
                    <div className="card">
                        <div className="card-header fw-bold bg-white">Quick links</div>
                        <ul className="list-group list-group-flush" >
                            <li className="list-group-item">
                                <a href="#" style={{ textDecoration: "none" }}>1. Track account opening</a>
                            </li>
                            <li className="list-group-item">
                                <a href="#" style={{ textDecoration: "none" }}>2. Track segment activation</a>
                            </li>
                            <li className="list-group-item">
                                <a href="#" style={{ textDecoration: "none" }}>3. Intraday margins</a>
                            </li>
                            <li className="list-group-item">
                                <a href="#" style={{ textDecoration: "none" }}>4. Kite user manual</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SupportHome;
