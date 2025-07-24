document.addEventListener('DOMContentLoaded', function() {
    const brandsLink = document.getElementById('brands-link');
    const brandsMenu = document.getElementById('brands-menu');

    if (brandsLink && brandsMenu) {
        brandsLink.addEventListener('click', function(event) {
            // Prevent the link from navigating
            event.preventDefault();
            
            // Toggle the 'show' class to display or hide the menu
            brandsMenu.classList.toggle('show');
        });

        // Optional: Close the dropdown if the user clicks outside of it
        window.addEventListener('click', function(event) {
            if (!brandsLink.contains(event.target) && !brandsMenu.contains(event.target)) {
                if (brandsMenu.classList.contains('show')) {
                    brandsMenu.classList.remove('show');
                }
            }
        });
    }
});
