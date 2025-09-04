
import React from 'react';

interface ScrollToLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}

const ScrollToLink: React.FC<ScrollToLinkProps> = ({ href, children, className = '', external = false }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (external) {
      window.open(href, '_blank');
      return;
    }
    
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
};

export default ScrollToLink;
