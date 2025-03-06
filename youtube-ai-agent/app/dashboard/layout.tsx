"use client";
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import NavigationProvider from '@/lib/NavigationProvider';
import { Authenticated } from 'convex/react'
import React from 'react'

const layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <NavigationProvider>
            <div className='flex h-screen'>
                <Authenticated>
                    <Sidebar />
                </Authenticated>
                <div className='bg-red-50 flex-1'>
                    <Header />
                    <main>
                        {children}
                    </main>
                </div>
            </div>
        </NavigationProvider>
    )
}

export default layout
