import React from 'react';

function Footer() {
    return (
        <footer className='border-top bg-light'>
            <div className='container py-4 '> {/* Added padding to the container */}
                <div className='row'>
                    <div className='col-lg-3 col-md-6 col-sm-12 mb-4'> {/* Added mb-4 for spacing between columns on smaller screens */}
                        <img src='media/images/logo.svg' alt='Logo' style={{ width: "50%" }} />
                        <p className="mt-3 text-muted">© 2010 - 2025, Zerodha Broking Ltd.<br /> All rights reserved.</p>
                        <div className="social-icons mt-3 d-flex"> {/* Added d-flex for row layout of icons */}
                            {/* Assuming Font Awesome is set up, these icons should render */}
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-x-twitter"></i></a>
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-square-facebook"></i></a>
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-instagram"></i></a>
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-linkedin-in"></i></a>
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-youtube"></i></a>
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-whatsapp"></i></a>
                            <a href="#" className="me-2 text-muted-custom"><i className="fa-brands fa-telegram"></i></a>
                        </div>
                    </div>
                    <div className='col-lg-2 col-md-6 col-sm-12 mb-4'>
                        <h5 className="fw-bold mb-3">Account</h5> {/* Added fw-bold for bolder heading and mb-3 for spacing */}
                        <ul className='list-unstyled'>
                            <li><a href='#' className="text-muted-custom">Open demat account</a></li>
                            <li><a href='#' className="text-muted-custom">Minor demat account</a></li>
                            <li><a href='#' className="text-muted-custom">NRI demat account</a></li>
                            <li><a href='#' className="text-muted-custom">Commodity</a></li>
                            <li><a href='#' className="text-muted-custom">Dematerialisation</a></li>
                            <li><a href='#' className="text-muted-custom">Fund transfer</a></li>
                            <li><a href='#' className="text-muted-custom">MTF</a></li>
                            <li><a href='#' className="text-muted-custom">Referral program</a></li>
                        </ul>
                    </div>
                    <div className='col-lg-2 col-md-6 col-sm-12 mb-4'>
                        <h5 className="fw-bold mb-3">Support</h5>
                        <ul className='list-unstyled'>
                            <li><a href='#' className="text-muted-custom">Contact us</a></li>
                            <li><a href='#' className="text-muted-custom">Support portal</a></li>
                            <li><a href='#' className="text-muted-custom">How to file a complaint?</a></li>
                            <li><a href='#' className="text-muted-custom">Status of your complaints</a></li>
                            <li><a href='#' className="text-muted-custom">Bulletin</a></li>
                            <li><a href='#' className="text-muted-custom">Circular</a></li>
                            <li><a href='#' className="text-muted-custom">Z-Connect blog</a></li>
                            <li><a href='#' className="text-muted-custom">Downloads</a></li>
                        </ul>
                    </div>
                    <div className='col-lg-2 col-md-6 col-sm-12 mb-4'>
                        <h5 className="fw-bold mb-3">Company</h5>
                        <ul className='list-unstyled'>
                            <li><a href='#' className="text-muted-custom">About</a></li>
                            <li><a href='#' className="text-muted-custom">Philosophy</a></li>
                            <li><a href='#' className="text-muted-custom">Press & media</a></li>
                            <li><a href='#' className="text-muted-custom">Careers</a></li>
                            <li><a href='#' className="text-muted-custom">Zerodha Cares (CSR)</a></li>
                            <li><a href='#' className="text-muted-custom">Zerodha.tech</a></li>
                            <li><a href='#' className="text-muted-custom">Open source</a></li>
                        </ul>
                    </div>
                    <div className='col-lg-3 col-md-6 col-sm-12 mb-4'>
                        <h5 className="fw-bold mb-3">Quick links</h5>
                        <ul className='list-unstyled'>
                            <li><a href='#' className="text-muted-custom">Upcoming IPOs</a></li>
                            <li><a href='#' className="text-muted-custom">Brokerage charges</a></li>
                            <li><a href='#' className="text-muted-custom">Market holidays</a></li>
                            <li><a href='#' className="text-muted-custom">Economic calendar</a></li>
                            <li><a href='#' className="text-muted-custom">Calculators</a></li>
                            <li><a href='#' className="text-muted-custom">Markets</a></li>
                            <li><a href='#' className="text-muted-custom">Sectors</a></li>
                        </ul>
                    </div>
                </div>
                {/* Horizontal line can be added here if needed, but not in image */}

                <div className='row mt-4'>
                    <div className='col-12'>
                        <p className="text-muted-legal fs-6">
                            Zerodha Broking Ltd.: Member of NSE, BSE​ &​ MCX – SEBI Registration no.: INZ000031633 CDSL/NSDL: Depository services through Zerodha Broking Ltd. – SEBI Registration no.: IN-DP-431-2019 Commodity Trading through Zerodha Commodities Pvt. Ltd. MCX: 46025; NSE-50001 – SEBI Registration no.: INZ000038238 Registered Address: Zerodha Broking Ltd., #153/154, 4th Cross, Dollars Colony, Opp. Clarence Public School, J.P Nagar 4th Phase, Bengaluru - 560078, Karnataka, India. For any complaints pertaining to securities broking please write to <a href="mailto:complaints@zerodha.com" className="text-blue-link">complaints@zerodha.com</a>, for DP related to <a href="mailto:dp@zerodha.com" className="text-blue-link">dp@zerodha.com</a>. Please ensure you carefully read the Risk Disclosure Document as prescribed by SEBI | ICF
                        </p>
                        <p className="text-muted-legal small-text mt-3"> {/* Added mt-3 for spacing */}
                            Procedure to file a complaint on <span className="fw-bold">SEBI SCORES</span>: Register on SCORES portal. Mandatory details for filing complaints on SCORES: Name, PAN, Address, Mobile Number, E-mail ID. Benefits: Effective Communication, Speedy redressal of the grievances
                        </p>
                        <p className="text-muted-legal small-text">
                            <a href="#" className="text-blue-link">Smart Online Dispute Resolution</a> | <a href="#" className="text-blue-link">Grievances Redressal Mechanism</a>
                        </p>
                        <p className="text-muted-legal small-text">
                            Investments in securities market are subject to market risks; read all the related documents carefully before investing.
                        </p>
                        <p className="text-muted-legal small-text">
                            Attention investors: 1) Stock brokers can accept securities as margins from clients only by way of pledge in the depository system w.e.f September 01, 2020. 2) Update your e-mail and phone number with your stock broker / depository participant and receive OTP directly from depository on your e-mail and/or mobile number to create pledge. 3) Check your securities / MF / bonds in the consolidated account statement issued by NSDL/CDSL every month.
                        </p>
                        <p className="text-muted-legal small-text">
                            "Prevent unauthorised transactions in your account. Update your mobile numbers/email IDs with your stock brokers. Receive information of your transactions directly from Exchange on your mobile/email at the end of the day. Issued in the interest of investors. KYC is one time exercise while dealing in securities markets - once KYC is done through a SEBI registered intermediary (broker, DP, Mutual Fund etc.), you need not undergo the same process again when you approach another intermediary." Dear Investor, if you are subscribing to an IPO, there is no need to issue a cheque. Please write the Bank account number and sign the IPO application form to authorize your bank to make payment in case of allotment. In case of non allotment the funds will remain in your bank account. As a business we don't give stock tips, and have not authorized anyone to trade on behalf of others. If you find anyone claiming to be part of Zerodha and offering such services, please <a href="#" className="text-blue-link">create a ticket here</a>.
                        </p>
                    </div>
                </div>
                <div className='row mt-4 pt-3 border-top'> {/* Added border-top and pt-3 for separation */}
                    <div className='col-12 d-flex justify-content-center flex-wrap'>
                        <a href="#" className="me-3 text-muted-legal small-text">NSE</a>
                        <a href="#" className="me-3 text-muted-legal small-text">BSE</a>
                        <a href="#" className="me-3 text-muted-legal small-text">MCX</a>
                        <a href="#" className="me-3 text-muted-legal small-text">Terms & conditions</a>
                        <a href="#" className="me-3 text-muted-legal small-text">Policies & procedures</a>
                        <a href="#" className="me-3 text-muted-legal small-text">Privacy policy</a>
                        <a href="#" className="me-3 text-muted-legal small-text">Disclosure</a>
                        <a href="#" className="me-3 text-muted-legal small-text">For investor's attention</a>
                        <a href="#" className="me-3 text-muted-legal small-text">Investor charter</a>
                    </div>
                </div>
            </div >
        </footer>
    );
}

export default Footer;