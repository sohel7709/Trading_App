import React from 'react';

function LeftSection({
    imageURL,
    productName,
    productDescription,
    tryDemo,
    learnMore,
    googlePlay,
    appStore
}) {
    return (
        <div className='container p-5'>
            <div className='row align-items-center'>
                <div className='col-md-6 text-center'>
                    <img
                        src={imageURL}
                        alt={productName}
                        className='img-fluid'
                        style={{ maxWidth: '80%' }}
                    />
                </div>
                <div className='col-md-6'>
                    <h3>{productName}</h3>
                    <p>{productDescription}</p>
                    <div className='text-primary fs-5'>
                        {tryDemo && (
                            <a
                                href={tryDemo}
                                className='mx-2 link-offset-2 link-underline link-underline-opacity-0'
                            >
                                Try Demo <i className='fa-solid fa-arrow-right'></i>
                            </a>
                        )}
                        {learnMore && (
                            <a
                                href={learnMore}
                                className='mx-2 link-offset-2 link-underline link-underline-opacity-0'
                            >
                                Learn More <i className='fa-solid fa-arrow-right'></i>
                            </a>
                        )}
                    </div>
                    <div className='d-flex mt-3'>
                        {googlePlay && (
                            <a href={googlePlay} className='me-2'>
                                <img
                                    src='media/images/google-play-badge.svg'
                                    alt='Google Play'
                                    className='img-fluid'
                                />
                            </a>
                        )}
                        {appStore && (
                            <a href={appStore} className='me-2'>
                                <img
                                    src='media/images/appstore-badge.svg'
                                    alt='App Store'
                                    className='img-fluid'
                                />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LeftSection;
